-- ══════════════════════════════════════════════
-- Clubs
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.clubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  interest VARCHAR(100),
  area_name VARCHAR(200),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  cover_url TEXT,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_count INT DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active clubs" ON public.clubs
  FOR SELECT TO authenticated, anon USING (active = true);

CREATE POLICY "Authenticated users can create clubs" ON public.clubs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creator can update own club" ON public.clubs
  FOR UPDATE TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "Creator can delete own club" ON public.clubs
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- ══════════════════════════════════════════════
-- Club Members
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.club_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (club_id, user_id)
);

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view club members" ON public.club_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can join clubs" ON public.club_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave clubs" ON public.club_members
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.clubs WHERE clubs.id = club_members.club_id AND clubs.creator_id = auth.uid()
  ));

-- ══════════════════════════════════════════════
-- Club Posts (admin announcements)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.club_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.club_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view club posts" ON public.club_posts
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Club creator can post" ON public.club_posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND EXISTS (
    SELECT 1 FROM public.clubs WHERE clubs.id = club_posts.club_id AND clubs.creator_id = auth.uid()
  ));

CREATE POLICY "Author can delete own posts" ON public.club_posts
  FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- ══════════════════════════════════════════════
-- RPC: get_clubs_nearby
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_clubs_nearby(user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  description TEXT,
  interest VARCHAR,
  area_name VARCHAR,
  cover_url TEXT,
  creator_id UUID,
  member_count INT,
  created_at TIMESTAMPTZ,
  distance_km DOUBLE PRECISION,
  creator_name VARCHAR
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.id, c.name, c.description, c.interest, c.area_name,
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

-- ══════════════════════════════════════════════
-- Grants
-- ══════════════════════════════════════════════
GRANT ALL ON TABLE public.clubs TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.club_members TO authenticated, service_role;
GRANT ALL ON TABLE public.club_posts TO authenticated, anon, service_role;
GRANT ALL ON FUNCTION public.get_clubs_nearby(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated, anon, service_role;
