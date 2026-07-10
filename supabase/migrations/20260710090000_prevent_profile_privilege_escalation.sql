-- "Users can update own profile" and "Admins can update any profile" only check
-- WHO is updating a row, never WHICH columns changed. That lets:
--   1. any authenticated user PATCH their own is_admin/admin_role/is_banned/etc.
--      directly via PostgREST and grant themselves admin,
--   2. any moderator (is_admin_or_mod() = true) promote themselves or anyone
--      else to super_admin, bypassing the app-level guardRole('super_admin')
--      check that setAdminRole() enforces.
-- Close both with a trigger that gates privileged-column changes on the
-- caller's *current* admin level, reusing the existing helper functions.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- NULL auth.uid() means there's no end-user JWT in play at all (service-role
  -- key, or a superuser/backend script) — not a role an end user can spoof,
  -- since a real authenticated-role JWT from Supabase Auth always carries a
  -- sub claim. Trust it, same as RLS already implicitly does for service_role.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin OR
      NEW.admin_role IS DISTINCT FROM OLD.admin_role)
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can change is_admin/admin_role';
  END IF;

  IF (NEW.is_banned IS DISTINCT FROM OLD.is_banned OR
      NEW.ban_reason IS DISTINCT FROM OLD.ban_reason OR
      NEW.ban_expires_at IS DISTINCT FROM OLD.ban_expires_at OR
      NEW.warning_count IS DISTINCT FROM OLD.warning_count)
     AND NOT public.is_admin_or_mod() THEN
    RAISE EXCEPTION 'Only admins can change ban/warning fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();
