-- ══════════════════════════════════════════════
-- Track whether a book must stay in permanent circulation (received via donation)
-- and how many readers have passed through it.
-- ══════════════════════════════════════════════
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS acquired_via_donation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_count INTEGER NOT NULL DEFAULT 0;

-- ══════════════════════════════════════════════
-- Auto-increment read_count whenever a book_request is marked returned.
-- Covers both: donated-book completions (via complete_donated_book_reading)
-- and lent-book returns (when owner marks status back to available).
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.increment_read_count_on_return()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'returned' AND OLD.status IS DISTINCT FROM 'returned' THEN
    UPDATE public.books SET read_count = read_count + 1 WHERE id = NEW.book_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_read_count ON public.book_requests;
CREATE TRIGGER trg_increment_read_count
  AFTER UPDATE OF status ON public.book_requests
  FOR EACH ROW EXECUTE FUNCTION public.increment_read_count_on_return();

-- ══════════════════════════════════════════════
-- Redefine complete_donated_book_reading to also set acquired_via_donation = true
-- so the book is locked into permanent circulation.
-- The trigger above handles read_count, so no manual increment needed here.
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.complete_donated_book_reading(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_book_id    uuid;
  v_reader_id  uuid;
BEGIN
  SELECT br.book_id, br.requester_id
    INTO v_book_id, v_reader_id
    FROM public.book_requests br
    JOIN public.books b ON b.id = br.book_id
   WHERE br.id            = p_request_id
     AND br.status        = 'handed_over'
     AND b.listing_type   = 'donate'
     AND br.requester_id  = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not authorised';
  END IF;

  -- Transfer ownership; lock into donate-only, mark as in-circulation
  UPDATE public.books
     SET owner_id              = v_reader_id,
         status                = 'available',
         listing_type          = 'donate',
         acquired_via_donation = true
   WHERE id = v_book_id;

  -- Mark request returned — fires trg_increment_read_count automatically
  UPDATE public.book_requests
     SET status       = 'returned',
         completed_at = now()
   WHERE id = p_request_id;

  DELETE FROM public.book_progress
   WHERE request_id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_donated_book_reading(uuid) TO authenticated;

-- ══════════════════════════════════════════════
-- Update get_books_nearby to return read_count and acquired_via_donation.
-- Must DROP first because PostgreSQL disallows changing a function's return type
-- via CREATE OR REPLACE.
-- ══════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_books_nearby(double precision, double precision);
CREATE OR REPLACE FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision)
RETURNS TABLE(
  "id"                    uuid,
  "title"                 character varying,
  "author"                character varying,
  "condition"             character varying,
  "listing_type"          character varying,
  "status"                character varying,
  "genre"                 character varying,
  "cover_url"             text,
  "owner_id"              uuid,
  "created_at"            timestamp with time zone,
  "distance_km"           double precision,
  "owner_name"            character varying,
  "owner_area"            character varying,
  "read_count"            integer,
  "acquired_via_donation" boolean
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
    p.area_name AS owner_area,
    b.read_count,
    b.acquired_via_donation
  FROM books b
  JOIN profiles p ON p.id = b.owner_id
  WHERE b.status IN ('available', 'given', 'unavailable')
  ORDER BY distance_km ASC NULLS LAST, b.created_at DESC;
$$;
