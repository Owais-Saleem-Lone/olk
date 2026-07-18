-- ══════════════════════════════════════════════
-- Club Events
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.club_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  cover_url TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  is_online BOOLEAN DEFAULT false,
  location_name VARCHAR(200),
  meeting_url TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'members_only')),
  capacity INT,
  attendee_count INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX idx_club_events_club_starts ON public.club_events (club_id, starts_at);
CREATE INDEX idx_club_events_starts_active ON public.club_events (starts_at) WHERE active = true;

ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;

-- Discovery is open regardless of club membership (matches "anyone can view
-- active clubs"); `visibility` gates the RSVP action below, not whether the
-- event can be seen/listed.
CREATE POLICY "Anyone can view active club events" ON public.club_events
  FOR SELECT TO authenticated, anon USING (active = true);

CREATE POLICY "Club creator can create events" ON public.club_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = creator_id
    AND EXISTS (SELECT 1 FROM public.clubs WHERE clubs.id = club_events.club_id AND clubs.creator_id = auth.uid())
  );

CREATE POLICY "Creator can update own event" ON public.club_events
  FOR UPDATE TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "Creator can delete own event" ON public.club_events
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- ══════════════════════════════════════════════
-- Event RSVPs
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_event_rsvps_event ON public.event_rsvps (event_id);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

-- Mirrors "Authenticated users can view club members" (open to any signed-in
-- user, not just the organizer/attendee) for consistency with how membership
-- lists are already treated elsewhere in the app.
CREATE POLICY "Authenticated users can view event rsvps" ON public.event_rsvps
  FOR SELECT TO authenticated USING (true);

-- Members-only events can only be RSVP'd to by club members; public events
-- accept anyone. The organizer decides per-event via club_events.visibility.
CREATE POLICY "Users can rsvp to events they can access" ON public.event_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_events e
      WHERE e.id = event_rsvps.event_id
        AND e.active = true
        AND (
          e.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM public.club_members cm
            WHERE cm.club_id = e.club_id AND cm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Users can cancel own rsvp" ON public.event_rsvps
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Atomic attendee_count, same pattern as trg_club_member_count.
CREATE OR REPLACE FUNCTION update_event_attendee_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE club_events SET attendee_count = attendee_count + 1 WHERE id = NEW.event_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE club_events SET attendee_count = GREATEST(0, attendee_count - 1) WHERE id = OLD.event_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_event_attendee_count
  AFTER INSERT OR DELETE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION update_event_attendee_count();

-- ══════════════════════════════════════════════
-- RPC: get_events_nearby (mirrors get_clubs_nearby)
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_events_nearby(user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION)
RETURNS TABLE (
  id UUID,
  club_id UUID,
  club_name VARCHAR,
  title VARCHAR,
  description TEXT,
  cover_url TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_online BOOLEAN,
  location_name VARCHAR,
  meeting_url TEXT,
  visibility VARCHAR,
  capacity INT,
  attendee_count INT,
  creator_id UUID,
  creator_name VARCHAR,
  distance_km DOUBLE PRECISION
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    e.id, e.club_id, c.name, e.title, e.description, e.cover_url,
    e.starts_at, e.ends_at, e.is_online, e.location_name, e.meeting_url,
    e.visibility, e.capacity, e.attendee_count, e.creator_id,
    p.display_name AS creator_name,
    CASE
      WHEN e.latitude IS NOT NULL AND e.longitude IS NOT NULL THEN
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(user_lat)) * cos(radians(e.latitude)) *
            cos(radians(e.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(e.latitude))
          ))
        )
      ELSE NULL
    END AS distance_km
  FROM club_events e
  JOIN clubs c ON c.id = e.club_id
  JOIN profiles p ON p.id = e.creator_id
  WHERE e.active = true
  ORDER BY distance_km ASC NULLS LAST, e.starts_at ASC;
$$;

-- ══════════════════════════════════════════════
-- Storage: event-covers bucket (mirrors book-covers)
-- ══════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-covers', 'event-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own event covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own event covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own event covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ══════════════════════════════════════════════
-- Feature flag
-- ══════════════════════════════════════════════
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('feature_events', 'true', 'Enable/disable club events feature')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════
-- Bug fix: club_posts were visible to anyone (including anon) via direct
-- query even after the parent club was deactivated (clubs.active = false),
-- because the SELECT policy on club_posts never checked the parent club's
-- active flag, unlike every other clubs-adjacent policy. Scope it the same
-- way club_events does.
-- ══════════════════════════════════════════════
DROP POLICY IF EXISTS "Anyone can view club posts" ON public.club_posts;

CREATE POLICY "Anyone can view active club posts" ON public.club_posts
  FOR SELECT TO authenticated, anon USING (
    EXISTS (SELECT 1 FROM public.clubs WHERE clubs.id = club_posts.club_id AND clubs.active = true)
  );

-- ══════════════════════════════════════════════
-- can_notify: add event_created branch (broadcast from event creator to a
-- club member, same shape as club_announcement). Function body must be
-- restated in full since CREATE OR REPLACE replaces the whole thing.
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_notify(
  p_target_user uuid,
  p_context_type text,
  p_context_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- ══════════════════════════════════════════════
-- Grants
-- ══════════════════════════════════════════════
GRANT ALL ON TABLE public.club_events TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.event_rsvps TO authenticated, service_role;
GRANT ALL ON FUNCTION public.get_events_nearby(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated, anon, service_role;
