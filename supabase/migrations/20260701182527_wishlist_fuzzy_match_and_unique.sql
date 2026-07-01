-- Wishlist matching fixes:
-- 1. The existing client-side `ilike '%title%'` match query ran under the book
--    owner's own session, but RLS only allows a user to SELECT their own
--    wishlist rows ("Users can view own wishlists"), so cross-user matches
--    silently never returned anything. A SECURITY DEFINER RPC is required to
--    look across all users' wishlists safely (it only ever returns id/user_id/
--    title, never other users' full rows).
-- 2. ilike also matched substrings anywhere ("The Book" inside "The Bookshelf
--    is Empty"). pg_trgm's similarity() gives proper fuzzy matching that
--    tolerates typos/word order without those false positives.
-- 3. Nothing stopped a user from adding the same title to their wishlist
--    multiple times, which would then fire duplicate match notifications.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_wishlists_title_trgm ON public.wishlists USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_title_trgm ON public.books USING gin (title gin_trgm_ops);

-- One active wishlist entry per user+title (case/whitespace insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlists_user_title_unique
  ON public.wishlists (user_id, lower(btrim(title)));

CREATE OR REPLACE FUNCTION public.match_wishlists_for_book(
  p_title text,
  p_owner_id uuid,
  p_threshold real DEFAULT 0.35
)
RETURNS TABLE (id uuid, user_id uuid, title text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.user_id, w.title
  FROM public.wishlists w
  WHERE w.active = true
    AND w.matched_book_id IS NULL
    AND w.user_id <> p_owner_id
    AND similarity(w.title, p_title) > p_threshold
  ORDER BY similarity(w.title, p_title) DESC;
$$;

REVOKE ALL ON FUNCTION public.match_wishlists_for_book(text, uuid, real) FROM public;
GRANT EXECUTE ON FUNCTION public.match_wishlists_for_book(text, uuid, real) TO authenticated;
