-- ══════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE ADMIN MIGRATION
-- Adds: admin roles, audit log, bans, warnings, announcements,
--        managed genres/areas, platform settings, admin notes,
--        enhanced reports, and secure RLS policies.
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────
-- 1. ADMIN ROLE ENUM + PROFILE COLUMNS
-- ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE admin_role AS ENUM ('super_admin', 'moderator', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_role admin_role,
  ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS ban_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS warning_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();

-- Migrate existing admins: set admin_role = 'super_admin' where is_admin = true
UPDATE public.profiles SET admin_role = 'super_admin' WHERE is_admin = true AND admin_role IS NULL;

-- ──────────────────────────────────────────
-- 2. HELPER: check if current user is admin
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_mod()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = true
      AND admin_role IN ('super_admin', 'moderator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = true
      AND admin_role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ──────────────────────────────────────────
-- 3. ADMIN AUDIT LOG
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id UUID,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.admin_audit_log(target_type, target_id);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND admin_id = auth.uid());

GRANT ALL ON TABLE public.admin_audit_log TO authenticated, service_role;

-- ──────────────────────────────────────────
-- 4. USER WARNINGS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_warnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warnings_user ON public.user_warnings(user_id);

ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all warnings"
  ON public.user_warnings FOR SELECT TO authenticated
  USING (public.is_admin_or_mod());

CREATE POLICY "Admins can insert warnings"
  ON public.user_warnings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_mod() AND admin_id = auth.uid());

GRANT ALL ON TABLE public.user_warnings TO authenticated, service_role;

-- ──────────────────────────────────────────
-- 5. USER BANS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_bans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  is_permanent boolean DEFAULT false,
  expires_at timestamptz,
  unbanned_at timestamptz,
  unbanned_by UUID REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bans_user ON public.user_bans(user_id);

ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all bans"
  ON public.user_bans FOR SELECT TO authenticated
  USING (public.is_admin_or_mod());

CREATE POLICY "Admins can insert bans"
  ON public.user_bans FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_mod() AND admin_id = auth.uid());

CREATE POLICY "Admins can update bans"
  ON public.user_bans FOR UPDATE TO authenticated
  USING (public.is_admin_or_mod());

GRANT ALL ON TABLE public.user_bans TO authenticated, service_role;

-- ──────────────────────────────────────────
-- 6. ANNOUNCEMENTS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'event')),
  is_banner boolean DEFAULT false,
  active boolean DEFAULT true,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active announcements"
  ON public.announcements FOR SELECT TO authenticated, anon
  USING (active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

CREATE POLICY "Admins can manage announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (public.is_admin_or_mod());

GRANT ALL ON TABLE public.announcements TO authenticated, anon, service_role;

-- ──────────────────────────────────────────
-- 7. MANAGED GENRES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genres (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE,
  display_order int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active genres"
  ON public.genres FOR SELECT TO authenticated, anon
  USING (active = true);

CREATE POLICY "Admins can manage genres"
  ON public.genres FOR ALL TO authenticated
  USING (public.is_admin_or_mod());

GRANT ALL ON TABLE public.genres TO authenticated, anon, service_role;

-- Seed default genres
INSERT INTO public.genres (name, display_order) VALUES
  ('General', 1), ('Fiction', 2), ('Non-Fiction', 3), ('Science', 4),
  ('History', 5), ('Poetry', 6), ('Biography', 7), ('Self-Help', 8),
  ('Religion', 9), ('Philosophy', 10), ('Technology', 11), ('Children', 12),
  ('Education', 13), ('Literature', 14), ('Romance', 15), ('Mystery', 16),
  ('Fantasy', 17), ('Urdu Literature', 18), ('Kashmiri Literature', 19)
ON CONFLICT (name) DO NOTHING;

-- ──────────────────────────────────────────
-- 8. MANAGED AREAS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name varchar(200) NOT NULL UNIQUE,
  district varchar(100),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active areas"
  ON public.areas FOR SELECT TO authenticated, anon
  USING (active = true);

CREATE POLICY "Admins can manage areas"
  ON public.areas FOR ALL TO authenticated
  USING (public.is_admin_or_mod());

GRANT ALL ON TABLE public.areas TO authenticated, anon, service_role;

-- Seed some Kashmir areas
INSERT INTO public.areas (name, district) VALUES
  ('Lal Chowk', 'Srinagar'), ('Hazratbal', 'Srinagar'), ('Rajbagh', 'Srinagar'),
  ('Jawahar Nagar', 'Srinagar'), ('Bemina', 'Srinagar'), ('Soura', 'Srinagar'),
  ('Hyderpora', 'Srinagar'), ('Nowgam', 'Srinagar'), ('Rainawari', 'Srinagar'),
  ('Dalgate', 'Srinagar'), ('Natipora', 'Srinagar'), ('Barzulla', 'Srinagar'),
  ('Anantnag Town', 'Anantnag'), ('Bijbehara', 'Anantnag'), ('Pahalgam', 'Anantnag'),
  ('Baramulla Town', 'Baramulla'), ('Sopore', 'Baramulla'), ('Uri', 'Baramulla'),
  ('Kupwara Town', 'Kupwara'), ('Handwara', 'Kupwara'),
  ('Budgam Town', 'Budgam'), ('Chadoora', 'Budgam'),
  ('Pulwama Town', 'Pulwama'), ('Tral', 'Pulwama'), ('Awantipora', 'Pulwama'),
  ('Shopian Town', 'Shopian'), ('Kulgam Town', 'Kulgam'),
  ('Ganderbal Town', 'Ganderbal'), ('Bandipora Town', 'Bandipora')
ON CONFLICT (name) DO NOTHING;

-- ──────────────────────────────────────────
-- 9. PLATFORM SETTINGS (feature flags, rate limits)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings"
  ON public.platform_settings FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Super admins can manage settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_super_admin());

GRANT ALL ON TABLE public.platform_settings TO authenticated, anon, service_role;

-- Seed default settings
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('max_books_per_user', '50', 'Maximum number of books a user can list'),
  ('max_requests_per_day', '10', 'Maximum book requests per user per day'),
  ('feature_clubs', 'true', 'Enable/disable clubs feature'),
  ('feature_wishlists', 'true', 'Enable/disable wishlists feature'),
  ('feature_ratings', 'true', 'Enable/disable ratings feature'),
  ('feature_messages', 'true', 'Enable/disable messaging feature'),
  ('overdue_days_threshold', '30', 'Days after which a lent book is considered overdue'),
  ('maintenance_mode', 'false', 'Put platform in maintenance mode')
ON CONFLICT (key) DO NOTHING;

-- ──────────────────────────────────────────
-- 10. ADMIN NOTES ON REPORTS
-- ──────────────────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'other';

CREATE TABLE IF NOT EXISTS public.admin_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_report ON public.admin_notes(report_id);

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view notes"
  ON public.admin_notes FOR SELECT TO authenticated
  USING (public.is_admin_or_mod());

CREATE POLICY "Admins can insert notes"
  ON public.admin_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_mod() AND admin_id = auth.uid());

GRANT ALL ON TABLE public.admin_notes TO authenticated, service_role;

-- ──────────────────────────────────────────
-- 11. NOTIFICATION TEMPLATES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE,
  title text NOT NULL,
  body text,
  type text DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view templates"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (public.is_admin_or_mod());

CREATE POLICY "Admins can manage templates"
  ON public.notification_templates FOR ALL TO authenticated
  USING (public.is_admin_or_mod());

GRANT ALL ON TABLE public.notification_templates TO authenticated, service_role;

-- Seed default templates
INSERT INTO public.notification_templates (name, title, body) VALUES
  ('welcome', 'Welcome to Open Library Kashmir!', 'We''re glad to have you. Start by listing your books or browsing what''s available in your area.'),
  ('warning_generic', 'Community Guidelines Reminder', 'Please review our community guidelines. Continued violations may result in account suspension.'),
  ('warning_listing', 'Listing Removed', 'One of your book listings has been removed by an admin for violating our guidelines.'),
  ('ban_temporary', 'Account Temporarily Suspended', 'Your account has been temporarily suspended due to community guideline violations.'),
  ('ban_permanent', 'Account Permanently Suspended', 'Your account has been permanently suspended for repeated or severe violations.'),
  ('unban', 'Account Restored', 'Your account has been restored. Please follow our community guidelines going forward.'),
  ('book_drive', 'Book Drive Event!', 'A community book drive is happening in your area. Check announcements for details!')
ON CONFLICT (name) DO NOTHING;

-- ──────────────────────────────────────────
-- 12. BOOKS: admin moderation fields
-- ──────────────────────────────────────────
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS hidden_by_admin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_hide_reason text,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- ──────────────────────────────────────────
-- 13. ANALYTICS HELPER FUNCTIONS
-- ──────────────────────────────────────────

-- Daily stats for growth charts
CREATE OR REPLACE FUNCTION public.admin_get_daily_stats(days_back int DEFAULT 30)
RETURNS TABLE (
  day date,
  new_users bigint,
  new_books bigint,
  new_requests bigint,
  completed_exchanges bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_daily_stats(int) TO authenticated;

-- Top contributors
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
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_top_contributors(int) TO authenticated;

-- Area stats
CREATE OR REPLACE FUNCTION public.admin_get_area_stats()
RETURNS TABLE (
  area_name varchar,
  user_count bigint,
  book_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.area_name,
    count(DISTINCT p.id) AS user_count,
    count(DISTINCT b.id) AS book_count
  FROM profiles p
  LEFT JOIN books b ON b.owner_id = p.id
  WHERE p.area_name IS NOT NULL AND p.area_name != ''
  GROUP BY p.area_name
  ORDER BY user_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_area_stats() TO authenticated;

-- Exchange success rate
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
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_exchange_stats() TO authenticated;

-- Overdue books
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
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_overdue_books(int) TO authenticated;

-- Rating distribution
CREATE OR REPLACE FUNCTION public.admin_get_rating_distribution()
RETURNS TABLE (
  score smallint,
  count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT s.score, COALESCE(r.cnt, 0) AS count
  FROM generate_series(1, 5) AS s(score)
  LEFT JOIN (
    SELECT score, count(*) AS cnt FROM ratings GROUP BY score
  ) r ON r.score = s.score
  ORDER BY s.score;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_rating_distribution() TO authenticated;

-- ──────────────────────────────────────────
-- 14. ADMIN RLS for existing tables
-- ──────────────────────────────────────────

-- Allow admins to read all profiles
DO $$ BEGIN
  CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT TO authenticated
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to update any profile (for banning, resetting names)
DO $$ BEGIN
  CREATE POLICY "Admins can update any profile"
    ON public.profiles FOR UPDATE TO authenticated
    USING (public.is_admin_or_mod());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to view all books
DO $$ BEGIN
  CREATE POLICY "Admins can view all books"
    ON public.books FOR SELECT TO authenticated
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to update any book (hide, edit)
DO $$ BEGIN
  CREATE POLICY "Admins can update any book"
    ON public.books FOR UPDATE TO authenticated
    USING (public.is_admin_or_mod());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to delete any book
DO $$ BEGIN
  CREATE POLICY "Admins can delete any book"
    ON public.books FOR DELETE TO authenticated
    USING (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to view all book requests
DO $$ BEGIN
  CREATE POLICY "Admins can view all requests"
    ON public.book_requests FOR SELECT TO authenticated
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to update any request (cancel stuck)
DO $$ BEGIN
  CREATE POLICY "Admins can update any request"
    ON public.book_requests FOR UPDATE TO authenticated
    USING (public.is_admin_or_mod());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to manage reports fully
DO $$ BEGIN
  CREATE POLICY "Admins can view all reports"
    ON public.reports FOR SELECT TO authenticated
    USING (public.is_admin_or_mod());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update reports"
    ON public.reports FOR UPDATE TO authenticated
    USING (public.is_admin_or_mod());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to manage clubs
DO $$ BEGIN
  CREATE POLICY "Admins can update any club"
    ON public.clubs FOR UPDATE TO authenticated
    USING (public.is_admin_or_mod());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete any club"
    ON public.clubs FOR DELETE TO authenticated
    USING (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to remove club members
DO $$ BEGIN
  CREATE POLICY "Admins can remove club members"
    ON public.club_members FOR DELETE TO authenticated
    USING (public.is_admin_or_mod());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to insert notifications for anyone (broadcast)
DO $$ BEGIN
  CREATE POLICY "Admins can insert notifications for anyone"
    ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (public.is_admin_or_mod());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to view all ratings
DO $$ BEGIN
  CREATE POLICY "Admins can view all ratings"
    ON public.ratings FOR SELECT TO authenticated
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to view all messages (for moderation)
DO $$ BEGIN
  CREATE POLICY "Admins can view all messages"
    ON public.messages FOR SELECT TO authenticated
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
