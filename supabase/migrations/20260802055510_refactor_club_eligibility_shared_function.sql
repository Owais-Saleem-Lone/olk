-- Single source of truth for club eligibility (5+ completed exchanges, clean
-- report record). Previously this rule was duplicated three times:
-- check_club_creation_eligibility(), check_club_request_eligibility(), and
-- clubs/create/page.tsx each ran their own copy of the same two counting
-- queries. Both triggers now defer to get_club_eligibility() below, and the
-- client reads the same numbers via my_club_eligibility() instead of
-- re-deriving them client-side.

CREATE OR REPLACE FUNCTION public.get_club_eligibility(p_user_id uuid)
RETURNS TABLE(eligible boolean, completed_exchanges int, report_count int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_exchanges int;
  v_report_count int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.book_requests br
       JOIN public.books b ON b.id = br.book_id
       WHERE b.owner_id = p_user_id AND br.status IN ('handed_over', 'returned'))
    +
    (SELECT count(*) FROM public.book_requests br
       WHERE br.requester_id = p_user_id AND br.status IN ('handed_over', 'returned'))
  INTO v_completed_exchanges;

  SELECT count(*) INTO v_report_count
  FROM public.reports WHERE reported_user_id = p_user_id;

  RETURN QUERY SELECT
    v_completed_exchanges >= 5 AND v_report_count = 0,
    v_completed_exchanges,
    v_report_count;
END;
$$;

-- Takes an arbitrary user_id and returns whether that user has been reported,
-- so it isn't safe to expose to PostgREST directly. Triggers below call it
-- straight (they already run SECURITY DEFINER); my_club_eligibility() is the
-- self-only wrapper clients use instead.
REVOKE ALL ON FUNCTION public.get_club_eligibility(uuid) FROM public;

CREATE OR REPLACE FUNCTION public.my_club_eligibility()
RETURNS TABLE(eligible boolean, completed_exchanges int, report_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.get_club_eligibility(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_club_eligibility() FROM public;
GRANT EXECUTE ON FUNCTION public.my_club_eligibility() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_club_request_eligibility()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (SELECT eligible FROM public.get_club_eligibility(NEW.requester_id)) THEN
    RAISE EXCEPTION 'Not eligible to request a club: requires 5+ completed exchanges and a clean report record';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_club_creation_eligibility()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (SELECT eligible FROM public.get_club_eligibility(NEW.creator_id)) THEN
    RAISE EXCEPTION 'Not eligible to create a club: requires 5+ completed exchanges and a clean report record';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
