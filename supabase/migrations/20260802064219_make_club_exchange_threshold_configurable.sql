-- Let a super_admin tune the club eligibility exchange count from the
-- existing Settings page (admin/settings/page.tsx already renders every
-- platform_settings row generically) instead of requiring a migration for
-- every threshold change. platform_settings is already RLS-restricted to
-- is_super_admin() for writes, and updatePlatformSetting() is already
-- guarded to 'super_admin' and audit-logged, so no new access-control code
-- is needed here -- only the setting row and the function reading it.
--
-- Deliberately NOT doing the same for the report-count check: exchange
-- count is a volume knob, low stakes either way, while "zero reports"
-- protects against someone with an active misconduct complaint starting a
-- club. That stays a fixed rule in the function body, not a runtime toggle.
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('club_min_exchanges', '5', 'Minimum completed exchanges required to request a club')
ON CONFLICT (key) DO NOTHING;

-- min_exchanges is added to the return row so the client can render the
-- real, current threshold (Chapter 13's note on get_books_nearby covers why
-- CREATE OR REPLACE alone can't add a column here -- a RETURNS TABLE change
-- is a return-type change, and Postgres requires the old signature dropped
-- first). my_club_eligibility() mirrors this table via `SELECT *`, so it has
-- to be dropped and recreated in the same order: dependent first.
DROP FUNCTION IF EXISTS public.my_club_eligibility();
DROP FUNCTION IF EXISTS public.get_club_eligibility(uuid);

CREATE FUNCTION public.get_club_eligibility(p_user_id uuid)
RETURNS TABLE(eligible boolean, completed_exchanges int, report_count int, min_exchanges int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_exchanges int;
  v_report_count int;
  v_min_exchanges int;
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

  v_min_exchanges := public.get_platform_setting_int('club_min_exchanges', 5);

  RETURN QUERY SELECT
    v_completed_exchanges >= v_min_exchanges AND v_report_count = 0,
    v_completed_exchanges,
    v_report_count,
    v_min_exchanges;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_eligibility(uuid) FROM public;

CREATE FUNCTION public.my_club_eligibility()
RETURNS TABLE(eligible boolean, completed_exchanges int, report_count int, min_exchanges int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.get_club_eligibility(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_club_eligibility() FROM public;
GRANT EXECUTE ON FUNCTION public.my_club_eligibility() TO authenticated;
