-- ══════════════════════════════════════════════
-- Bookmarks (save books for later)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, book_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks"
  ON public.bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks"
  ON public.bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON public.bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════
-- Ratings (after completed exchanges)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.book_requests(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rated_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (request_id, rater_id)
);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all ratings"
  ON public.ratings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert own ratings"
  ON public.ratings FOR INSERT
  WITH CHECK (auth.uid() = rater_id);

-- ══════════════════════════════════════════════
-- Wishlists (books users are looking for)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  genre VARCHAR(100),
  active BOOLEAN DEFAULT true,
  matched_book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wishlists"
  ON public.wishlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wishlists"
  ON public.wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wishlists"
  ON public.wishlists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wishlists"
  ON public.wishlists FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════
-- Weekly digest preference on profiles
-- ══════════════════════════════════════════════
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_digest BOOLEAN DEFAULT true;

-- ══════════════════════════════════════════════
-- Grants
-- ══════════════════════════════════════════════
GRANT ALL ON TABLE public.bookmarks TO authenticated;
GRANT ALL ON TABLE public.bookmarks TO service_role;
GRANT ALL ON TABLE public.ratings TO authenticated;
GRANT ALL ON TABLE public.ratings TO service_role;
GRANT ALL ON TABLE public.wishlists TO authenticated;
GRANT ALL ON TABLE public.wishlists TO service_role;
