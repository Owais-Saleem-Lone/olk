-- The previous migration's "Club members can view fellow members" and
-- "Members and participants can view event rsvps" policies both checked
-- membership via a raw EXISTS subquery against the *same* table the policy
-- is defined on (club_members querying club_members, event_rsvps querying
-- event_rsvps). Confirmed via tests/rls/event-rsvp-capacity.test.ts: Postgres
-- rejects this outright with "infinite recursion detected in policy for
-- relation \"club_members\"" (42P17) as soon as anything else (here, the
-- RSVP capacity check's club_members join) needs to evaluate that policy --
-- it's a static cycle in how RLS unfolds policies, not something that
-- resolves at runtime even though the underlying logic terminates.
--
-- Standard fix: route the self-check through a STABLE SECURITY DEFINER
-- function. Owned by postgres (same as every other helper here, e.g.
-- is_admin_or_mod), so its internal SELECT runs as the table owner and never
-- re-enters RLS on club_members/event_rsvps at all -- no cycle.

CREATE OR REPLACE FUNCTION "public"."is_club_member"("p_club_id" "uuid", "p_user_id" "uuid")
RETURNS boolean
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "club_members" WHERE "club_id" = p_club_id AND "user_id" = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION "public"."is_event_participant"("p_event_id" "uuid", "p_user_id" "uuid")
RETURNS boolean
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "event_rsvps" WHERE "event_id" = p_event_id AND "user_id" = p_user_id
  );
$$;

DROP POLICY IF EXISTS "Club members can view fellow members" ON "public"."club_members";

CREATE POLICY "Club members can view fellow members" ON "public"."club_members"
  FOR SELECT TO "authenticated"
  USING (
    "public"."is_club_member"("club_members"."club_id", "auth"."uid"())
    OR "public"."is_admin_or_mod"()
  );

DROP POLICY IF EXISTS "Members and participants can view event rsvps" ON "public"."event_rsvps";

CREATE POLICY "Members and participants can view event rsvps" ON "public"."event_rsvps"
  FOR SELECT TO "authenticated"
  USING (
    "user_id" = "auth"."uid"()
    OR EXISTS (
      SELECT 1 FROM "public"."club_events" "e"
      WHERE "e"."id" = "event_rsvps"."event_id" AND "public"."is_club_member"("e"."club_id", "auth"."uid"())
    )
    OR "public"."is_event_participant"("event_rsvps"."event_id", "auth"."uid"())
    OR "public"."is_admin_or_mod"()
  );
