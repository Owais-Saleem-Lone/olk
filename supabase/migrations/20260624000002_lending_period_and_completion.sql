-- ══════════════════════════════════════════════
-- Lending duration (1 / 2 / 3 months), set by owner when listing
-- ══════════════════════════════════════════════
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS lending_duration_months SMALLINT
  CHECK (lending_duration_months IN (1, 2, 3));

-- ══════════════════════════════════════════════
-- Transfer a donated book to its reader once they finish it.
-- The reader becomes the new owner; the book re-enters the pool.
-- SECURITY DEFINER so we can update books.owner_id even though
-- the caller does not own the book yet — auth.uid() is still
-- validated inside to prevent abuse.
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.complete_donated_book_reading(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_book_id    uuid;
  v_reader_id  uuid;
BEGIN
  -- Validate: caller must be the requester of a handed-over donation
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

  -- Transfer ownership; book re-enters the pool under the reader
  UPDATE public.books
     SET owner_id = v_reader_id,
         status   = 'available'
   WHERE id = v_book_id;

  -- Close out the original request
  UPDATE public.book_requests
     SET status       = 'returned',
         completed_at = now()
   WHERE id = p_request_id;

  -- Remove the progress record (fresh start for the next reader)
  DELETE FROM public.book_progress
   WHERE request_id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_donated_book_reading(uuid) TO authenticated;
