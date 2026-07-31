-- The book-covers bucket was apparently created manually on the remote
-- project at some point -- storage.objects RLS policies referencing
-- bucket_id = 'book-covers' have existed since 20260621123649_remote_schema,
-- but unlike event-covers (20260718120000) and club-covers (20260718150000),
-- no migration ever ran `INSERT INTO storage.buckets` for it. A fresh
-- `supabase db reset` (a new contributor's first setup, or CI) therefore has
-- no book-covers bucket at all -- every cover upload fails with "Bucket not
-- found", invisible until someone actually tries it. Found while building
-- the RLS/storage integration test suite (tests/rls/storage-book-covers-path-scope.test.ts).
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;
