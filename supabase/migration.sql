-- ================================================
-- OLK Platform — Feature Migration
-- Run this in your Supabase SQL Editor (once)
-- ================================================

-- ────────────────────────────────────────────────
-- 1. NOTIFICATIONS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ────────────────────────────────────────────────
-- 2. BOOK HANDOVER — new columns on book_requests
-- ────────────────────────────────────────────────
ALTER TABLE book_requests ADD COLUMN IF NOT EXISTS handed_over_at TIMESTAMPTZ;
ALTER TABLE book_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Widen the status CHECK constraint to allow handover/return statuses
ALTER TABLE book_requests DROP CONSTRAINT IF EXISTS book_requests_status_check;
ALTER TABLE book_requests ADD CONSTRAINT book_requests_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'handed_over', 'returned'));

-- ────────────────────────────────────────────────
-- 3. DUPLICATE REQUEST PREVENTION
-- Only one active (pending/accepted) request per user per book
-- ────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_request
  ON book_requests(book_id, requester_id)
  WHERE status IN ('pending', 'accepted', 'handed_over');

-- ────────────────────────────────────────────────
-- 4. REPORTS TABLE
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reported_book_id UUID REFERENCES books(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users view own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- ────────────────────────────────────────────────
-- 5. ADMIN ROLE
-- ────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Admin policies — full read access for dashboard
CREATE POLICY "Admins view all reports"
  ON reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins update reports"
  ON reports FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins delete books"
  ON books FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins manage book_of_month"
  ON book_of_month FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins update profiles"
  ON profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ────────────────────────────────────────────────
-- MAKE YOURSELF ADMIN
-- Replace YOUR_USER_ID with your actual user id
-- (find it in Supabase → Authentication → Users)
-- ────────────────────────────────────────────────
UPDATE profiles SET is_admin = true WHERE id = '0caf59a6-608f-44ed-a8cd-d7f0e5558b21';
