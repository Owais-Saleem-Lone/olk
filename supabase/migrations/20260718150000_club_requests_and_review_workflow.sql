-- ══════════════════════════════════════════════
-- Clubs: single `interest` -> multi-select `interests`
-- ══════════════════════════════════════════════
ALTER TABLE public.clubs ADD COLUMN interests TEXT[] NOT NULL DEFAULT '{}';
UPDATE public.clubs SET interests = ARRAY[interest] WHERE interest IS NOT NULL AND interest <> '';
ALTER TABLE public.clubs DROP COLUMN interest;
CREATE INDEX idx_clubs_interests ON public.clubs USING GIN (interests);

-- ══════════════════════════════════════════════
-- Club Requests: the new create-a-club flow is submit-then-review, not
-- instant self-service insert. A verified-eligible member submits a full
-- application; only an approved application ever produces a real `clubs`
-- row (via approve_club_request() below).
-- ══════════════════════════════════════════════
CREATE TABLE public.club_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  interests TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  goal TEXT,
  target_members TEXT,
  area_name VARCHAR(200),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  cover_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_club_id UUID REFERENCES public.clubs(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_club_requests_requester ON public.club_requests (requester_id, created_at DESC);
CREATE INDEX idx_club_requests_status ON public.club_requests (status, created_at DESC);

ALTER TABLE public.club_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requester views own requests" ON public.club_requests
  FOR SELECT TO authenticated USING (auth.uid() = requester_id);

CREATE POLICY "Admins view all requests" ON public.club_requests
  FOR SELECT TO authenticated USING (public.is_admin_or_mod());

CREATE POLICY "Eligible users submit requests" ON public.club_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);

-- Withdraw your own request while it's still pending -- the only regular-user
-- write this table ever allows. Approval/rejection go through the
-- SECURITY DEFINER functions below, never a direct UPDATE, so there is no
-- UPDATE policy on this table at all: even a moderator's own session cannot
-- flip `status` directly, only the audited RPC path can.
CREATE POLICY "Requester withdraws own pending request" ON public.club_requests
  FOR DELETE TO authenticated USING (auth.uid() = requester_id AND status = 'pending');

-- ══════════════════════════════════════════════
-- Eligibility, mirrored from check_club_creation_eligibility (Chapter 17):
-- the same 5-completed-exchanges/no-reports bar, but gating *requests* now,
-- since regular users can no longer insert into `clubs` directly (see the
-- policy drop further down). Column name differs (requester_id, matching
-- book_requests' own naming) so this is a small, deliberate duplicate of the
-- original trigger rather than a reuse of it.
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_club_request_eligibility()
RETURNS TRIGGER AS $$
DECLARE
  completed_count INT;
  report_count INT;
BEGIN
  SELECT
    (SELECT count(*) FROM public.book_requests br
       JOIN public.books b ON b.id = br.book_id
       WHERE b.owner_id = NEW.requester_id AND br.status IN ('handed_over', 'returned'))
    +
    (SELECT count(*) FROM public.book_requests br
       WHERE br.requester_id = NEW.requester_id AND br.status IN ('handed_over', 'returned'))
  INTO completed_count;

  SELECT count(*) INTO report_count
  FROM public.reports WHERE reported_user_id = NEW.requester_id;

  IF completed_count < 5 OR report_count > 0 THEN
    RAISE EXCEPTION 'Not eligible to request a club: requires 5+ completed exchanges and a clean report record';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_check_club_request_eligibility
  BEFORE INSERT ON public.club_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_club_request_eligibility();

-- ══════════════════════════════════════════════
-- Word limits, same technique as check_book_notes_limits (100-word note cap):
-- name <= 10 words, description <= 200, goal/target_members <= 50 each.
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_club_request_limits()
RETURNS TRIGGER AS $$
DECLARE
  name_words INT;
  desc_words INT;
  goal_words INT;
  target_words INT;
BEGIN
  name_words := array_length(regexp_split_to_array(btrim(NEW.name), '\s+'), 1);
  IF name_words > 10 THEN
    RAISE EXCEPTION 'Club name exceeds the 10-word limit (got % words)', name_words;
  END IF;

  desc_words := array_length(regexp_split_to_array(btrim(NEW.description), '\s+'), 1);
  IF desc_words > 200 THEN
    RAISE EXCEPTION 'Description exceeds the 200-word limit (got % words)', desc_words;
  END IF;

  IF NEW.goal IS NOT NULL AND btrim(NEW.goal) <> '' THEN
    goal_words := array_length(regexp_split_to_array(btrim(NEW.goal), '\s+'), 1);
    IF goal_words > 50 THEN
      RAISE EXCEPTION 'Goal exceeds the 50-word limit (got % words)', goal_words;
    END IF;
  END IF;

  IF NEW.target_members IS NOT NULL AND btrim(NEW.target_members) <> '' THEN
    target_words := array_length(regexp_split_to_array(btrim(NEW.target_members), '\s+'), 1);
    IF target_words > 50 THEN
      RAISE EXCEPTION 'Target members exceeds the 50-word limit (got % words)', target_words;
    END IF;
  END IF;

  IF NEW.review_note IS NOT NULL AND btrim(NEW.review_note) <> '' THEN
    IF array_length(regexp_split_to_array(btrim(NEW.review_note), '\s+'), 1) > 100 THEN
      RAISE EXCEPTION 'Review note exceeds the 100-word limit';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_check_club_request_limits
  BEFORE INSERT OR UPDATE ON public.club_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_club_request_limits();

-- ══════════════════════════════════════════════
-- Approval materializes the real club; rejection just closes the request.
-- Both are SECURITY DEFINER with their own internal is_admin_or_mod() check
-- (defence in depth on top of the moderator-gated Server Action that calls
-- them), following the same "trusted RPC does a write no ordinary RLS
-- policy should grant" shape as complete_donated_book_reading (Chapter 13).
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.approve_club_request(p_request_id uuid, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO public.clubs (name, description, interests, area_name, latitude, longitude, cover_url, creator_id)
  VALUES (v_request.name, v_request.description, v_request.interests, v_request.area_name,
          v_request.latitude, v_request.longitude, v_request.cover_url, v_request.requester_id)
  RETURNING id INTO v_new_club_id;

  INSERT INTO public.club_members (club_id, user_id) VALUES (v_new_club_id, v_request.requester_id);

  UPDATE public.club_requests
  SET status = 'approved', review_note = p_note, reviewed_by = auth.uid(),
      reviewed_at = now(), created_club_id = v_new_club_id
  WHERE id = p_request_id;

  RETURN v_new_club_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_club_request(p_request_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_mod() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.club_requests
  SET status = 'rejected', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already reviewed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_club_request(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.reject_club_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_club_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_club_request(uuid, text) TO authenticated;

-- ══════════════════════════════════════════════
-- Regular users can no longer insert into `clubs` at all -- the only path to
-- a new club is an approved request, materialized by approve_club_request()
-- above, which runs as the function owner and so is exempt from this table's
-- RLS. Dropping this policy without replacing it means INSERT is closed for
-- every ordinary session; leaving the old policy in place would let anyone
-- bypass the entire review workflow with a direct REST call, exactly the
-- kind of gap this feature exists to close.
-- ══════════════════════════════════════════════
DROP POLICY IF EXISTS "Authenticated users can create clubs" ON public.clubs;

-- ══════════════════════════════════════════════
-- get_clubs_nearby: interest (varchar) -> interests (text[])
-- ══════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_clubs_nearby(double precision, double precision);
CREATE OR REPLACE FUNCTION get_clubs_nearby(user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  description TEXT,
  interests TEXT[],
  area_name VARCHAR,
  cover_url TEXT,
  creator_id UUID,
  member_count INT,
  created_at TIMESTAMPTZ,
  distance_km DOUBLE PRECISION,
  creator_name VARCHAR
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
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
    p.display_name AS creator_name
  FROM clubs c
  JOIN profiles p ON p.id = c.creator_id
  WHERE c.active = true
  ORDER BY distance_km ASC NULLS LAST, c.member_count DESC;
$$;

GRANT ALL ON FUNCTION public.get_clubs_nearby(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated, anon, service_role;

-- ══════════════════════════════════════════════
-- Storage: club-covers bucket (mirrors book-covers / event-covers)
-- ══════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-covers', 'club-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own club covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'club-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own club covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'club-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'club-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own club covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'club-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ══════════════════════════════════════════════
-- Grants
-- ══════════════════════════════════════════════
GRANT ALL ON TABLE public.club_requests TO authenticated, service_role;
