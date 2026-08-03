-- Admin-role security audit fixes (2026-08-03).
--
-- 1. HIGH: admin_get_daily_stats / admin_get_top_contributors / admin_get_area_stats /
--    admin_get_exchange_stats / admin_get_overdue_books / admin_get_rating_distribution
--    were SECURITY DEFINER with no internal admin check, and granted to `anon` --
--    confirmed exploitable with a bare curl + the public anon key, no login at all,
--    returning e.g. who currently owes which borrowed book to whom. proxy.ts's /admin
--    redirect and requireAdmin() never come into play for a direct RPC call.
-- 2. club_events had no admin-tier RLS policy at all, so the moderator-gated
--    deactivateEvent/reactivateEvent actions silently affected 0 rows for any event
--    the acting admin didn't personally create -- while withAdminAction still wrote a
--    "success" row to admin_audit_log regardless, since it never checks affected row
--    count. This is exactly the "admin must be able to act on a violating event"
--    workflow that needs to actually work.
-- 3. clubs has the identical gap: no policy lets an admin SELECT an inactive club, so
--    admin/clubs's "Inactive" tab (and the same tab on admin/events) returns zero rows
--    via RLS even though the row exists -- there is nothing to click "Reactivate" on.
-- 4. book_of_month's admin policy used is_admin() (any tier, including viewer) while
--    saveBotm requires 'moderator' -- a viewer-tier admin could write to it via a
--    direct REST call, bypassing the app-level tier the Server Action enforces.
-- 5. Hygiene: pin search_path on the three role-check functions (already done for
--    guard_profile_privileged_columns and the club-request RPCs; these three were
--    missed), extend the privilege-escalation guard to BEFORE INSERT as well as
--    UPDATE (the "Users can insert own profile" policy's WITH CHECK places no
--    restriction on is_admin/admin_role/ban fields -- currently unreachable since
--    handle_new_user() always creates the row first and there's no profiles DELETE
--    policy, but a real gap in what this trigger's own stated goal claims to close),
--    and explicitly revoke UPDATE/DELETE on admin_audit_log rather than relying solely
--    on "no policy exists" as the backstop.

-- ══════════════════════════════════════════════
-- 1. Guard the admin_get_* RPCs
-- ══════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.admin_get_daily_stats(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_top_contributors(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_area_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_exchange_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_overdue_books(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_rating_distribution() FROM anon;

CREATE OR REPLACE FUNCTION public.admin_get_daily_stats(days_back int DEFAULT 30)
RETURNS TABLE (
  day date,
  new_users bigint,
  new_books bigint,
  new_requests bigint,
  completed_exchanges bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      (current_date - (days_back || ' days')::interval)::date,
      current_date,
      '1 day'::interval
    )::date AS day
  )
  SELECT
    ds.day,
    COALESCE((SELECT count(*) FROM profiles WHERE created_at::date = ds.day), 0) AS new_users,
    COALESCE((SELECT count(*) FROM books WHERE created_at::date = ds.day), 0) AS new_books,
    COALESCE((SELECT count(*) FROM book_requests WHERE created_at::date = ds.day), 0) AS new_requests,
    COALESCE((SELECT count(*) FROM book_requests WHERE completed_at::date = ds.day), 0) AS completed_exchanges
  FROM date_series ds
  ORDER BY ds.day;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_top_contributors(lim int DEFAULT 10)
RETURNS TABLE (
  user_id UUID,
  display_name varchar,
  area_name varchar,
  books_listed bigint,
  books_donated bigint,
  books_lent bigint,
  avg_rating numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.display_name,
    p.area_name,
    count(b.id) AS books_listed,
    count(b.id) FILTER (WHERE b.listing_type = 'donate') AS books_donated,
    count(b.id) FILTER (WHERE b.listing_type = 'lend') AS books_lent,
    COALESCE(round(avg(r.score)::numeric, 1), 0) AS avg_rating
  FROM profiles p
  LEFT JOIN books b ON b.owner_id = p.id
  LEFT JOIN ratings r ON r.rated_user_id = p.id
  WHERE p.is_banned = false
  GROUP BY p.id, p.display_name, p.area_name
  ORDER BY books_listed DESC
  LIMIT lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_area_stats()
RETURNS TABLE (
  area_name varchar,
  user_count bigint,
  book_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.area_name,
    count(DISTINCT p.id) AS user_count,
    count(DISTINCT b.id) AS book_count
  FROM profiles p
  LEFT JOIN books b ON b.owner_id = p.id
  WHERE p.area_name IS NOT NULL AND p.area_name != ''
  GROUP BY p.area_name
  ORDER BY user_count DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_exchange_stats()
RETURNS TABLE (
  total_requests bigint,
  pending_count bigint,
  accepted_count bigint,
  declined_count bigint,
  handed_over_count bigint,
  returned_count bigint,
  success_rate numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    count(*) AS total_requests,
    count(*) FILTER (WHERE status = 'pending') AS pending_count,
    count(*) FILTER (WHERE status = 'accepted') AS accepted_count,
    count(*) FILTER (WHERE status = 'declined') AS declined_count,
    count(*) FILTER (WHERE status = 'handed_over') AS handed_over_count,
    count(*) FILTER (WHERE status = 'returned') AS returned_count,
    CASE
      WHEN count(*) FILTER (WHERE status IN ('accepted','handed_over','returned','declined')) > 0
      THEN round(
        (count(*) FILTER (WHERE status IN ('handed_over','returned'))::numeric /
         count(*) FILTER (WHERE status IN ('accepted','handed_over','returned','declined'))::numeric) * 100,
        1
      )
      ELSE 0
    END AS success_rate
  FROM book_requests;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_overdue_books(threshold_days int DEFAULT 30)
RETURNS TABLE (
  request_id UUID,
  book_title varchar,
  book_author varchar,
  owner_name varchar,
  borrower_name varchar,
  handed_over_at timestamptz,
  days_overdue int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    br.id AS request_id,
    b.title AS book_title,
    b.author AS book_author,
    owner_p.display_name AS owner_name,
    borrower_p.display_name AS borrower_name,
    br.handed_over_at,
    (current_date - br.handed_over_at::date) AS days_overdue
  FROM book_requests br
  JOIN books b ON b.id = br.book_id
  JOIN profiles owner_p ON owner_p.id = b.owner_id
  JOIN profiles borrower_p ON borrower_p.id = br.requester_id
  WHERE br.status = 'handed_over'
    AND b.listing_type = 'lend'
    AND br.handed_over_at IS NOT NULL
    AND (current_date - br.handed_over_at::date) > threshold_days
  ORDER BY days_overdue DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_rating_distribution()
RETURNS TABLE (
  score smallint,
  count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT s.score, COALESCE(r.cnt, 0) AS count
  FROM generate_series(1, 5) AS s(score)
  LEFT JOIN (
    SELECT score, count(*) AS cnt FROM ratings GROUP BY score
  ) r ON r.score = s.score
  ORDER BY s.score;
END;
$$;

-- ══════════════════════════════════════════════
-- 2. club_events: give admins the same visibility + write access clubs already has
-- ══════════════════════════════════════════════
CREATE POLICY "Admins can view all events" ON public.club_events
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update any event" ON public.club_events
  FOR UPDATE TO authenticated USING (public.is_admin_or_mod());

-- ══════════════════════════════════════════════
-- 3. clubs: same visibility gap -- admin/clubs's "Inactive" tab has nothing to show
-- ══════════════════════════════════════════════
CREATE POLICY "Admins can view all clubs" ON public.clubs
  FOR SELECT TO authenticated USING (public.is_admin());

-- ══════════════════════════════════════════════
-- 4. book_of_month: match saveBotm's actual 'moderator' tier
-- ══════════════════════════════════════════════
ALTER POLICY "Admins manage book_of_month" ON public.book_of_month
  USING (public.is_admin_or_mod());

-- ══════════════════════════════════════════════
-- 5a. Pin search_path on the role-check functions (bodies unchanged)
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true); $$;

CREATE OR REPLACE FUNCTION public.is_admin_or_mod() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true AND admin_role IN ('super_admin','moderator')); $$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true AND admin_role = 'super_admin'); $$;

-- ══════════════════════════════════════════════
-- 5b. Extend the escalation guard to BEFORE INSERT too (OLD isn't available on
-- INSERT, so the INSERT branch compares against each column's own default instead)
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF (NEW.is_admin IS DISTINCT FROM false OR NEW.admin_role IS NOT NULL)
       AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can set is_admin/admin_role';
    END IF;

    IF (NEW.is_banned IS DISTINCT FROM false OR NEW.ban_reason IS NOT NULL OR
        NEW.ban_expires_at IS NOT NULL OR NEW.warning_count IS DISTINCT FROM 0)
       AND NOT public.is_admin_or_mod() THEN
      RAISE EXCEPTION 'Only admins can set ban/warning fields';
    END IF;

    RETURN NEW;
  END IF;

  IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.admin_role IS DISTINCT FROM OLD.admin_role)
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can change is_admin/admin_role';
  END IF;

  IF (NEW.is_banned IS DISTINCT FROM OLD.is_banned OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason OR
      NEW.ban_expires_at IS DISTINCT FROM OLD.ban_expires_at OR NEW.warning_count IS DISTINCT FROM OLD.warning_count)
     AND NOT public.is_admin_or_mod() THEN
    RAISE EXCEPTION 'Only admins can change ban/warning fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ══════════════════════════════════════════════
-- 5c. admin_audit_log: explicit revoke rather than relying solely on "no policy
-- exists" as the only thing stopping an UPDATE/DELETE
-- ══════════════════════════════════════════════
REVOKE UPDATE, DELETE ON public.admin_audit_log FROM anon, authenticated;
