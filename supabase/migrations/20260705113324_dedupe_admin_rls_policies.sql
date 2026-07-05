-- profiles/reports each carry a legacy admin policy (from the original
-- schema dump) alongside a newer, equivalent one added in
-- 20260627095459_admin_comprehensive.sql. Postgres OR-combines permissive
-- policies, so this was harmless but doubled the surface area to keep in
-- sync. setAdminRole() always sets is_admin and admin_role together (and
-- 20260627095459 backfilled admin_role for pre-existing admins), so
-- is_admin_or_mod() is a safe superset of the legacy is_admin = true check.
-- Drop the legacy duplicates and keep the newer, function-based policies.
DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins update reports" ON public.reports;
DROP POLICY IF EXISTS "Admins view all reports" ON public.reports;
