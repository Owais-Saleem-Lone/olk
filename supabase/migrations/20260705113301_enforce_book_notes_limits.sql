-- book-notes-modal.tsx enforces a 100-word note limit and a max-10-notes-
-- per-book cap client-side only, with no matching CHECK/trigger. Mirror both
-- rules at the database layer.
CREATE OR REPLACE FUNCTION public.check_book_notes_limits()
RETURNS TRIGGER AS $$
DECLARE
  word_count INT;
  other_notes_count INT;
BEGIN
  word_count := array_length(regexp_split_to_array(btrim(NEW.note), '\s+'), 1);
  IF word_count > 100 THEN
    RAISE EXCEPTION 'Note exceeds the 100-word limit (got % words)', word_count;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO other_notes_count
    FROM public.book_notes
    WHERE book_id = NEW.book_id AND user_id <> NEW.user_id;

    IF other_notes_count >= 10 THEN
      RAISE EXCEPTION 'This book already has 10 community notes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_check_book_notes_limits
  BEFORE INSERT OR UPDATE ON public.book_notes
  FOR EACH ROW EXECUTE FUNCTION public.check_book_notes_limits();
