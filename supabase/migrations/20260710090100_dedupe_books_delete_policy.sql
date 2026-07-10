-- "Admins delete books" (legacy, is_admin = true) was never dropped when
-- 20260627095459_admin_comprehensive.sql added "Admins can delete any book"
-- gated on is_super_admin(). Postgres OR-combines permissive policies, so
-- the legacy policy still lets any moderator delete arbitrary books,
-- bypassing the intended super-admin-only restriction. The 2026-07-05
-- dedupe migration cleaned up profiles/reports but missed this one.
DROP POLICY IF EXISTS "Admins delete books" ON public.books;
