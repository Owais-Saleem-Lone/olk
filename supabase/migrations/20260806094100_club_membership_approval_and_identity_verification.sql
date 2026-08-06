-- Two workflow changes:
--
--   1. Club membership becomes request-then-approve instead of instant
--      self-join: club_members gets a status ('pending' | 'approved'), new
--      joins default to 'pending', and only the club creator can move a row
--      to 'approved'. Every place that previously checked "is this user in
--      club_members" now means "is this user an *approved* member" via
--      is_club_member(), which is redefined once here and used everywhere
--      (chat posting, ratings, members-only RSVP, the member roster itself,
--      notification fan-out) -- one definition of membership, not five.
--      member_count only ever counts approved rows.
--
--   2. club_requests (the *club creation* request, reviewed by admins) gets
--      an identity_verified flag. approve_club_request() now refuses to
--      create the club until an admin has explicitly marked identity as
--      verified via the new mark_club_request_identity_verified() RPC --
--      the actual ID/CV exchange happens over email outside the app, this
--      just makes "did we actually check" a hard gate instead of an honor
--      system.

-- ---------------------------------------------------------------------------
-- 1. club_members: pending -> approved workflow
-- ---------------------------------------------------------------------------

-- Existing rows joined under the old instant-join model, so they're
-- grandfathered in as approved; new inserts (no explicit status) default to
-- 'pending' going forward. Two-step ADD COLUMN so the backfill and the new
-- default don't fight each other.
ALTER TABLE "public"."club_members" ADD COLUMN "status" character varying(20) DEFAULT 'approved' NOT NULL;
ALTER TABLE "public"."club_members" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "public"."club_members" ADD CONSTRAINT "club_members_status_check" CHECK (("status")::"text" = ANY ((ARRAY['pending', 'approved'])::"text"[]));

CREATE OR REPLACE FUNCTION "public"."is_club_member"("p_club_id" "uuid", "p_user_id" "uuid")
RETURNS boolean
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "club_members"
    WHERE "club_id" = p_club_id AND "user_id" = p_user_id AND "status" = 'approved'
  );
$$;

DROP POLICY IF EXISTS "Users can join clubs" ON "public"."club_members";
CREATE POLICY "Users can request to join clubs" ON "public"."club_members"
  FOR INSERT TO "authenticated"
  WITH CHECK ("auth"."uid"() = "user_id" AND "status" = 'pending');

DROP POLICY IF EXISTS "Club members can view fellow members" ON "public"."club_members";
CREATE POLICY "Members and owners can view the roster" ON "public"."club_members"
  FOR SELECT TO "authenticated"
  USING (
    "user_id" = "auth"."uid"()
    OR ("status" = 'approved' AND "public"."is_club_member"("club_members"."club_id", "auth"."uid"()))
    OR EXISTS (
      SELECT 1 FROM "public"."clubs" "c"
      WHERE "c"."id" = "club_members"."club_id" AND "c"."creator_id" = "auth"."uid"()
    )
    OR "public"."is_admin_or_mod"()
  );

CREATE POLICY "Club creator can approve membership requests" ON "public"."club_members"
  FOR UPDATE TO "authenticated"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."clubs" "c"
      WHERE "c"."id" = "club_members"."club_id" AND "c"."creator_id" = "auth"."uid"()
    )
  )
  WITH CHECK ("status" = 'approved');

-- member_count now tracks approved membership only: a pending applicant
-- doesn't move the count, approval (UPDATE) does, and so does a later
-- removal/rejection.
CREATE OR REPLACE FUNCTION "public"."update_club_member_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      UPDATE clubs SET member_count = member_count + 1 WHERE id = NEW.club_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'approved' AND NEW.status = 'approved' THEN
      UPDATE clubs SET member_count = member_count + 1 WHERE id = NEW.club_id;
    ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
      UPDATE clubs SET member_count = GREATEST(0, member_count - 1) WHERE id = NEW.club_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN
      UPDATE clubs SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.club_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "trg_club_member_count" ON "public"."club_members";
CREATE TRIGGER "trg_club_member_count"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."club_members"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."update_club_member_count"();

-- Everywhere else that meant "is a member" now means "is an *approved*
-- member" by routing through is_club_member() instead of a raw EXISTS.
DROP POLICY IF EXISTS "Club members can post in chat" ON "public"."club_posts";
CREATE POLICY "Club members can post in chat" ON "public"."club_posts"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "auth"."uid"() = "author_id"
    AND "public"."is_club_member"("club_posts"."club_id", "auth"."uid"())
  );

DROP POLICY IF EXISTS "Members can rate clubs they belong to" ON "public"."club_ratings";
CREATE POLICY "Members can rate clubs they belong to" ON "public"."club_ratings"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "auth"."uid"() = "rater_id"
    AND "public"."is_club_member"("club_ratings"."club_id", "auth"."uid"())
  );

DROP POLICY IF EXISTS "Users can rsvp to events they can access" ON "public"."event_rsvps";
CREATE POLICY "Users can rsvp to events they can access" ON "public"."event_rsvps"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "auth"."uid"() = "user_id"
    AND EXISTS (
      SELECT 1 FROM "public"."club_events" "e"
      WHERE "e"."id" = "event_rsvps"."event_id"
        AND "e"."active" = true
        AND ("e"."capacity" IS NULL OR "e"."attendee_count" < "e"."capacity")
        AND (
          "e"."visibility" = 'public'
          OR "public"."is_club_member"("e"."club_id", "auth"."uid"())
        )
    )
  );

-- Bulk notification fan-out should only reach approved members.
CREATE OR REPLACE FUNCTION "public"."notify_club_chat_message"("p_post_id" "uuid")
RETURNS TABLE("user_id" "uuid", "title" "text")
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_author_id uuid;
  v_club_name text;
BEGIN
  SELECT "cp"."club_id", "cp"."author_id", "c"."name"
    INTO v_club_id, v_author_id, v_club_name
  FROM "club_posts" "cp"
  JOIN "clubs" "c" ON "c"."id" = "cp"."club_id"
  WHERE "cp"."id" = p_post_id;

  IF v_club_id IS NULL OR v_author_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  INSERT INTO "notifications" ("user_id", "type", "title", "link")
  SELECT "cm"."user_id", 'club_announcement', 'New message in "' || v_club_name || '"', '/clubs/' || v_club_id
  FROM "club_members" "cm"
  WHERE "cm"."club_id" = v_club_id AND "cm"."user_id" <> v_author_id AND "cm"."status" = 'approved'
  RETURNING "notifications"."user_id", "notifications"."title";
END;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_event_created"("p_event_id" "uuid")
RETURNS TABLE("user_id" "uuid", "title" "text")
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_creator_id uuid;
  v_club_name text;
  v_event_title text;
BEGIN
  SELECT "e"."club_id", "e"."creator_id", "c"."name", "e"."title"
    INTO v_club_id, v_creator_id, v_club_name, v_event_title
  FROM "club_events" "e"
  JOIN "clubs" "c" ON "c"."id" = "e"."club_id"
  WHERE "e"."id" = p_event_id;

  IF v_club_id IS NULL OR v_creator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  INSERT INTO "notifications" ("user_id", "type", "title", "link")
  SELECT "cm"."user_id", 'event_created', 'New event in "' || v_club_name || '": ' || v_event_title, '/events/' || p_event_id
  FROM "club_members" "cm"
  WHERE "cm"."club_id" = v_club_id AND "cm"."user_id" <> v_creator_id AND "cm"."status" = 'approved'
  RETURNING "notifications"."user_id", "notifications"."title";
END;
$$;

-- can_notify: owner -> requester "you're approved" notification, alongside
-- the existing requester -> owner "someone wants to join" (club_join) branch,
-- which needs no change -- it only checks a club_members row exists at all,
-- regardless of status, which is still true the instant a request is filed.
CREATE OR REPLACE FUNCTION "public"."can_notify"("p_target_user" "uuid", "p_context_type" "text", "p_context_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_requester uuid;
  v_owner uuid;
  v_creator uuid;
BEGIN
  IF v_caller IS NULL OR v_caller = p_target_user OR p_context_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_context_type = 'request' THEN
    SELECT br.requester_id, b.owner_id INTO v_requester, v_owner
    FROM public.book_requests br
    JOIN public.books b ON b.id = br.book_id
    WHERE br.id = p_context_id;

    RETURN v_requester IS NOT NULL
      AND ((v_caller = v_requester AND p_target_user = v_owner)
        OR (v_caller = v_owner AND p_target_user = v_requester));

  ELSIF p_context_type = 'club_join' THEN
    SELECT creator_id INTO v_creator FROM public.clubs WHERE id = p_context_id;

    RETURN v_creator IS NOT NULL
      AND v_creator = p_target_user
      AND EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_context_id AND user_id = v_caller
      );

  ELSIF p_context_type = 'club_membership_approved' THEN
    SELECT creator_id INTO v_creator FROM public.clubs WHERE id = p_context_id;

    RETURN v_creator IS NOT NULL
      AND v_caller = v_creator
      AND EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_context_id AND user_id = p_target_user AND status = 'approved'
      );

  ELSIF p_context_type = 'club_announcement' THEN
    SELECT creator_id INTO v_creator FROM public.clubs WHERE id = p_context_id;

    RETURN v_creator IS NOT NULL
      AND v_caller = v_creator
      AND EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_context_id AND user_id = p_target_user
      );

  ELSIF p_context_type = 'event_created' THEN
    SELECT e.creator_id INTO v_creator FROM public.club_events e WHERE e.id = p_context_id;

    RETURN v_creator IS NOT NULL
      AND v_caller = v_creator
      AND EXISTS (
        SELECT 1 FROM public.club_events e
        JOIN public.club_members cm ON cm.club_id = e.club_id
        WHERE e.id = p_context_id AND cm.user_id = p_target_user
      );

  ELSIF p_context_type = 'wishlist_match' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.wishlists w
      JOIN public.books b ON b.id = w.matched_book_id
      WHERE w.id = p_context_id AND w.user_id = p_target_user AND b.owner_id = v_caller
    );
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. club_requests: identity verification gate before approval
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."club_requests"
  ADD COLUMN "identity_verified" boolean DEFAULT false NOT NULL,
  ADD COLUMN "identity_verified_at" timestamp with time zone,
  ADD COLUMN "identity_verified_by" "uuid" REFERENCES "public"."profiles"("id");

CREATE OR REPLACE FUNCTION "public"."mark_club_request_identity_verified"("p_request_id" "uuid")
RETURNS "void"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_mod() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.club_requests
  SET identity_verified = true, identity_verified_at = now(), identity_verified_by = auth.uid()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already reviewed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION "public"."mark_club_request_identity_verified"("uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."mark_club_request_identity_verified"("uuid") TO "authenticated";

-- approve_club_request now refuses to materialize the club until identity has
-- been verified -- the creator becomes an *approved* club_members row
-- directly (they don't request-then-approve their own club).
CREATE OR REPLACE FUNCTION "public"."approve_club_request"("p_request_id" "uuid", "p_note" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_request public.club_requests%ROWTYPE;
  v_new_club_id uuid;
BEGIN
  IF NOT public.is_admin_or_mod() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_request FROM public.club_requests WHERE id = p_request_id AND status = 'pending';
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found or already reviewed';
  END IF;

  IF NOT v_request.identity_verified THEN
    RAISE EXCEPTION 'Identity must be verified (ID + CV reviewed) before this request can be approved';
  END IF;

  INSERT INTO public.clubs (name, description, interests, area_name, latitude, longitude, cover_url, creator_id)
  VALUES (v_request.name, v_request.description, v_request.interests, v_request.area_name,
          v_request.latitude, v_request.longitude, v_request.cover_url, v_request.requester_id)
  RETURNING id INTO v_new_club_id;

  INSERT INTO public.club_members (club_id, user_id, status) VALUES (v_new_club_id, v_request.requester_id, 'approved');

  UPDATE public.club_requests
  SET status = 'approved', review_note = p_note, reviewed_by = auth.uid(),
      reviewed_at = now(), created_club_id = v_new_club_id
  WHERE id = p_request_id;

  RETURN v_new_club_id;
END;
$$;
