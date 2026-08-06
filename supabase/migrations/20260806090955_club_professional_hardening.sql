-- Club/event professional hardening pass:
--   1. Member rosters and event attendee lists are no longer readable by every
--      authenticated user -- only fellow club members, the event's own
--      participants, and admins can see who's in a club or who's going to an
--      event. Club/event *descriptions* stay public (including to anon) --
--      only the participant-identifying lists were ever meant to be private.
--   2. club_posts becomes a real two-way club chat: any member can post, not
--      just the creator, gated by role-aware hourly rate limits.
--   3. club_ratings is new: members-only rating of the clubs they belong to,
--      with a denormalized clubs.rating_avg/rating_count kept in sync by
--      trigger (same pattern as update_club_member_count).
--   4. Event creation is capped at 1/month per club and RSVP capacity is
--      capped at 10, both via platform_settings so a later "pro" tier is a
--      settings change, not a migration (mirrors club_min_exchanges).
--   5. Notification fan-out (club chat message / new event) moves from N
--      client-driven round trips into a single bulk INSERT...SELECT RPC per
--      action, so posting to a large club is O(1) round trips regardless of
--      member count.

-- ---------------------------------------------------------------------------
-- 1. Visibility: club_members and event_rsvps restricted to members/participants
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can view club members" ON "public"."club_members";

CREATE POLICY "Club members can view fellow members" ON "public"."club_members"
  FOR SELECT TO "authenticated"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."club_members" "cm2"
      WHERE "cm2"."club_id" = "club_members"."club_id" AND "cm2"."user_id" = "auth"."uid"()
    )
    OR "public"."is_admin_or_mod"()
  );

DROP POLICY IF EXISTS "Authenticated users can view event rsvps" ON "public"."event_rsvps";

-- Visible to: the row's own owner, any club member of that event's club, any
-- other participant of that same event (so a non-member who RSVP'd to a
-- public event can still see the rest of the attendee list), and admins.
CREATE POLICY "Members and participants can view event rsvps" ON "public"."event_rsvps"
  FOR SELECT TO "authenticated"
  USING (
    "user_id" = "auth"."uid"()
    OR EXISTS (
      SELECT 1 FROM "public"."club_events" "e"
      JOIN "public"."club_members" "cm" ON "cm"."club_id" = "e"."club_id"
      WHERE "e"."id" = "event_rsvps"."event_id" AND "cm"."user_id" = "auth"."uid"()
    )
    OR EXISTS (
      SELECT 1 FROM "public"."event_rsvps" "self"
      WHERE "self"."event_id" = "event_rsvps"."event_id" AND "self"."user_id" = "auth"."uid"()
    )
    OR "public"."is_admin_or_mod"()
  );

-- ---------------------------------------------------------------------------
-- 2. club_posts: any member can post (not just the creator), with moderation
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Club creator can post" ON "public"."club_posts";

CREATE POLICY "Club members can post in chat" ON "public"."club_posts"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "auth"."uid"() = "author_id"
    AND EXISTS (
      SELECT 1 FROM "public"."club_members" "cm"
      WHERE "cm"."club_id" = "club_posts"."club_id" AND "cm"."user_id" = "auth"."uid"()
    )
  );

-- Opening posting up to every member needs a moderation backstop that didn't
-- exist when only the (trusted) creator could write here.
CREATE POLICY "Club creator can delete any post in their club" ON "public"."club_posts"
  FOR DELETE TO "authenticated"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."clubs" "c"
      WHERE "c"."id" = "club_posts"."club_id" AND "c"."creator_id" = "auth"."uid"()
    )
  );

CREATE POLICY "Admins can delete any club post" ON "public"."club_posts"
  FOR DELETE TO "authenticated"
  USING ("public"."is_admin_or_mod"());

-- Role-aware hourly rate limit: owners get a higher ceiling than members.
INSERT INTO "public"."platform_settings" ("key", "value", "description") VALUES
  ('club_chat_owner_messages_per_hour', '30', 'Max club chat messages per hour for the club owner'),
  ('club_chat_member_messages_per_hour', '10', 'Max club chat messages per hour for a regular club member')
ON CONFLICT ("key") DO NOTHING;

CREATE OR REPLACE FUNCTION "public"."enforce_club_post_rate_limit"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
DECLARE
  v_is_owner boolean;
  v_limit int;
  v_count int;
BEGIN
  SELECT ("creator_id" = NEW."author_id") INTO v_is_owner
  FROM "public"."clubs" WHERE "id" = NEW."club_id";

  IF v_is_owner THEN
    v_limit := "public"."get_platform_setting_int"('club_chat_owner_messages_per_hour', 30);
  ELSE
    v_limit := "public"."get_platform_setting_int"('club_chat_member_messages_per_hour', 10);
  END IF;

  SELECT count(*) INTO v_count
  FROM "public"."club_posts"
  WHERE "author_id" = NEW."author_id"
    AND "created_at" > now() - interval '1 hour';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: max % messages per hour reached', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_enforce_club_post_rate_limit" ON "public"."club_posts";
CREATE TRIGGER "trg_enforce_club_post_rate_limit"
  BEFORE INSERT ON "public"."club_posts"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."enforce_club_post_rate_limit"();

-- ---------------------------------------------------------------------------
-- 3. club_ratings: members-only club ratings, denormalized onto clubs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."club_ratings" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
  "club_id" "uuid" NOT NULL REFERENCES "public"."clubs"("id") ON DELETE CASCADE,
  "rater_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "score" smallint NOT NULL,
  "comment" "text",
  "created_at" timestamp with time zone DEFAULT "now"(),
  CONSTRAINT "club_ratings_score_check" CHECK (("score" >= 1) AND ("score" <= 5)),
  CONSTRAINT "club_ratings_club_id_rater_id_key" UNIQUE ("club_id", "rater_id")
);

ALTER TABLE "public"."club_ratings" OWNER TO "postgres";
ALTER TABLE "public"."club_ratings" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_club_ratings_club" ON "public"."club_ratings" USING "btree" ("club_id");

CREATE POLICY "Members can rate clubs they belong to" ON "public"."club_ratings"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "auth"."uid"() = "rater_id"
    AND EXISTS (
      SELECT 1 FROM "public"."club_members" "cm"
      WHERE "cm"."club_id" = "club_ratings"."club_id" AND "cm"."user_id" = "auth"."uid"()
    )
  );

CREATE POLICY "Raters can update own club rating" ON "public"."club_ratings"
  FOR UPDATE TO "authenticated"
  USING ("auth"."uid"() = "rater_id")
  WITH CHECK ("auth"."uid"() = "rater_id");

CREATE POLICY "Raters can delete own club rating" ON "public"."club_ratings"
  FOR DELETE TO "authenticated"
  USING ("auth"."uid"() = "rater_id");

CREATE POLICY "Admins can delete any club rating" ON "public"."club_ratings"
  FOR DELETE TO "authenticated"
  USING ("public"."is_admin_or_mod"());

-- Individual rater identity + comment stays authenticated-only (mirrors the
-- existing book "ratings" table's "Users can view all ratings" policy); the
-- public-facing summary is the denormalized clubs.rating_avg/rating_count
-- below, which carries no rater identity.
CREATE POLICY "Authenticated users can view club ratings" ON "public"."club_ratings"
  FOR SELECT TO "authenticated"
  USING (true);

ALTER TABLE "public"."clubs"
  ADD COLUMN IF NOT EXISTS "rating_avg" numeric(3,2),
  ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL;

CREATE OR REPLACE FUNCTION "public"."update_club_rating_stats"()
RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_club_id uuid := COALESCE(NEW."club_id", OLD."club_id");
BEGIN
  UPDATE "clubs" "c"
  SET "rating_avg" = "stats"."avg_score",
      "rating_count" = "stats"."cnt"
  FROM (
    SELECT avg("score")::numeric(3,2) AS avg_score, count(*) AS cnt
    FROM "club_ratings" WHERE "club_id" = v_club_id
  ) "stats"
  WHERE "c"."id" = v_club_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS "trg_club_rating_stats" ON "public"."club_ratings";
CREATE TRIGGER "trg_club_rating_stats"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."club_ratings"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."update_club_rating_stats"();

-- ---------------------------------------------------------------------------
-- 4. Event creation: 1/month per club, RSVP capacity capped at 10
-- ---------------------------------------------------------------------------

INSERT INTO "public"."platform_settings" ("key", "value", "description") VALUES
  ('max_club_events_per_month', '1', 'Max events a single club may create per rolling 30 days (free plan)'),
  ('max_event_capacity', '10', 'Max RSVP capacity allowed on a single event (free plan)')
ON CONFLICT ("key") DO NOTHING;

CREATE OR REPLACE FUNCTION "public"."enforce_club_event_monthly_limit"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  v_limit := "public"."get_platform_setting_int"('max_club_events_per_month', 1);

  SELECT count(*) INTO v_count
  FROM "public"."club_events"
  WHERE "club_id" = NEW."club_id"
    AND "created_at" > now() - interval '30 days';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: max % events per 30 days reached for this club', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_enforce_club_event_monthly_limit" ON "public"."club_events";
CREATE TRIGGER "trg_enforce_club_event_monthly_limit"
  BEFORE INSERT ON "public"."club_events"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."enforce_club_event_monthly_limit"();

CREATE OR REPLACE FUNCTION "public"."enforce_club_event_capacity_cap"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
DECLARE
  v_cap int;
BEGIN
  v_cap := "public"."get_platform_setting_int"('max_event_capacity', 10);

  IF NEW."capacity" IS NULL THEN
    NEW."capacity" := v_cap;
  ELSIF NEW."capacity" > v_cap THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: event capacity cannot exceed % participants on the current plan', v_cap
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_enforce_club_event_capacity_cap" ON "public"."club_events";
CREATE TRIGGER "trg_enforce_club_event_capacity_cap"
  BEFORE INSERT OR UPDATE ON "public"."club_events"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."enforce_club_event_capacity_cap"();

-- ---------------------------------------------------------------------------
-- 5. Bulk notification fan-out RPCs -- one INSERT...SELECT instead of N
--    client-driven round trips. Each returns the (user_id, title) pairs it
--    just inserted so the caller can batch-send emails without a second
--    query, and does its own authorization check rather than trusting the
--    client (same posture as can_notify()).
-- ---------------------------------------------------------------------------

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
  WHERE "cm"."club_id" = v_club_id AND "cm"."user_id" <> v_author_id
  RETURNING "notifications"."user_id", "notifications"."title";
END;
$$;

REVOKE ALL ON FUNCTION "public"."notify_club_chat_message"("uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."notify_club_chat_message"("uuid") TO "authenticated";

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
  WHERE "cm"."club_id" = v_club_id AND "cm"."user_id" <> v_creator_id
  RETURNING "notifications"."user_id", "notifications"."title";
END;
$$;

REVOKE ALL ON FUNCTION "public"."notify_event_created"("uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."notify_event_created"("uuid") TO "authenticated";

-- get_clubs_nearby returns rating_avg/rating_count too, so the public browse
-- list can show a club's rating without a second per-card query. A RETURNS
-- TABLE column addition is a return-type change, so the old signature has to
-- be dropped first (same reasoning as get_club_eligibility's own comment).
DROP FUNCTION IF EXISTS "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision);

CREATE FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) RETURNS TABLE("id" "uuid", "name" character varying, "description" "text", "interests" "text"[], "area_name" character varying, "cover_url" "text", "creator_id" "uuid", "member_count" integer, "created_at" timestamp with time zone, "distance_km" double precision, "creator_name" character varying, "rating_avg" numeric, "rating_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    c.id, c.name, c.description, c.interests, c.area_name,
    c.cover_url, c.creator_id, c.member_count, c.created_at,
    CASE
      WHEN c.latitude IS NOT NULL AND c.longitude IS NOT NULL THEN
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(user_lat)) * cos(radians(c.latitude)) *
            cos(radians(c.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(c.latitude))
          ))
        )
      ELSE NULL
    END AS distance_km,
    p.display_name AS creator_name,
    c.rating_avg, c.rating_count
  FROM clubs c
  JOIN profiles p ON p.id = c.creator_id
  WHERE c.active = true
  ORDER BY distance_km ASC NULLS LAST, c.member_count DESC;
$$;

ALTER FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) OWNER TO "postgres";
