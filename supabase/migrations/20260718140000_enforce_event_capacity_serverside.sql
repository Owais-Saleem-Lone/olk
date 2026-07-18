-- The "Event full" state was only checked client-side (events/[id]/page.tsx
-- disables the RSVP button once attendee_count >= capacity); the INSERT
-- policy on event_rsvps never checked capacity at all, so a direct PostgREST
-- call could RSVP past a full event's capacity. Confirmed via manual testing:
-- POST /rest/v1/event_rsvps succeeded (201) against a capacity=1 event that
-- already had 1 attendee. Add the same server-side guard the visibility
-- check already gets.
DROP POLICY IF EXISTS "Users can rsvp to events they can access" ON public.event_rsvps;

CREATE POLICY "Users can rsvp to events they can access" ON public.event_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_events e
      WHERE e.id = event_rsvps.event_id
        AND e.active = true
        AND (e.capacity IS NULL OR e.attendee_count < e.capacity)
        AND (
          e.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM public.club_members cm
            WHERE cm.club_id = e.club_id AND cm.user_id = auth.uid()
          )
        )
    )
  );
