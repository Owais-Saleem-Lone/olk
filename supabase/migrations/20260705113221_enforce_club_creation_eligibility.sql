-- Club-creation eligibility (5+ completed exchanges, no reports) was only
-- checked in clubs/create/page.tsx; the clubs INSERT policy allowed any
-- authenticated user through, so the rule was trivially bypassable via a
-- direct API call. Mirror the same rule (completed exchanges as either book
-- owner or requester, plus a clean report record) as a BEFORE INSERT trigger.
CREATE OR REPLACE FUNCTION public.check_club_creation_eligibility()
RETURNS TRIGGER AS $$
DECLARE
  completed_count INT;
  report_count INT;
BEGIN
  SELECT
    (SELECT count(*) FROM public.book_requests br
       JOIN public.books b ON b.id = br.book_id
       WHERE b.owner_id = NEW.creator_id AND br.status IN ('handed_over', 'returned'))
    +
    (SELECT count(*) FROM public.book_requests br
       WHERE br.requester_id = NEW.creator_id AND br.status IN ('handed_over', 'returned'))
  INTO completed_count;

  SELECT count(*) INTO report_count
  FROM public.reports WHERE reported_user_id = NEW.creator_id;

  IF completed_count < 5 OR report_count > 0 THEN
    RAISE EXCEPTION 'Not eligible to create a club: requires 5+ completed exchanges and a clean report record';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_check_club_creation_eligibility
  BEFORE INSERT ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.check_club_creation_eligibility();
