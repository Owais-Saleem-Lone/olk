-- ══════════════════════════════════════════════
-- Book Progress (reading progress set by the current reader)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.book_progress (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id     UUID        NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  request_id  UUID        NOT NULL REFERENCES public.book_requests(id) ON DELETE CASCADE,
  reader_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  progress_pct SMALLINT   NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT book_progress_request_unique UNIQUE (request_id)
);

ALTER TABLE public.book_progress ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see reading progress (community feature)
CREATE POLICY "Authenticated users can view reading progress"
  ON public.book_progress FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Reader can insert own progress"
  ON public.book_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reader_id);

CREATE POLICY "Reader can update own progress"
  ON public.book_progress FOR UPDATE TO authenticated
  USING (auth.uid() = reader_id)
  WITH CHECK (auth.uid() = reader_id);

CREATE POLICY "Reader can delete own progress"
  ON public.book_progress FOR DELETE TO authenticated
  USING (auth.uid() = reader_id);

GRANT ALL ON TABLE public.book_progress TO authenticated;
GRANT ALL ON TABLE public.book_progress TO service_role;

-- ══════════════════════════════════════════════
-- Book Notes (personal notes from any authenticated user)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.book_notes (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id    UUID        NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT book_notes_book_user_unique UNIQUE (book_id, user_id)
);

ALTER TABLE public.book_notes ENABLE ROW LEVEL SECURITY;

-- Visible only to registered users
CREATE POLICY "Authenticated users can view book notes"
  ON public.book_notes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert own book notes"
  ON public.book_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own book notes"
  ON public.book_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own book notes"
  ON public.book_notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.book_notes TO authenticated;
GRANT ALL ON TABLE public.book_notes TO service_role;

-- ══════════════════════════════════════════════
-- Update get_books_nearby to also return 'unavailable'
-- books so the community can see books currently being read
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision)
RETURNS TABLE(
  "id"          uuid,
  "title"       character varying,
  "author"      character varying,
  "condition"   character varying,
  "listing_type" character varying,
  "status"      character varying,
  "genre"       character varying,
  "cover_url"   text,
  "owner_id"    uuid,
  "created_at"  timestamp with time zone,
  "distance_km" double precision,
  "owner_name"  character varying,
  "owner_area"  character varying
)
LANGUAGE "sql" STABLE SECURITY DEFINER
AS $$
  SELECT
    b.id, b.title, b.author, b.condition, b.listing_type, b.status,
    b.genre, b.cover_url, b.owner_id, b.created_at,
    CASE
      WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL THEN
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(user_lat)) * cos(radians(p.latitude)) *
            cos(radians(p.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(p.latitude))
          ))
        )
      ELSE NULL
    END AS distance_km,
    p.display_name AS owner_name,
    p.area_name AS owner_area
  FROM books b
  JOIN profiles p ON p.id = b.owner_id
  WHERE b.status IN ('available', 'given', 'unavailable')
  ORDER BY distance_km ASC NULLS LAST, b.created_at DESC;
$$;
