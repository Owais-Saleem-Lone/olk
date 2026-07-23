-- These FK/status columns are queried constantly but never got explicit
-- indexes (Postgres only auto-indexes primary keys, not foreign keys):
-- books.owner_id (my-books page), books.status (browse filter),
-- messages.request_id (message thread + the per-row RLS policy joining
-- book_requests/books), club_members.user_id (composite (club_id, user_id)
-- unique index exists but can't serve a user_id-only lookup), and
-- bookmarks.user_id (browse page's bookmarked-books lookup).
-- Flagged by a Vercel/10k-user readiness audit (2026-07-23).

CREATE INDEX IF NOT EXISTS "idx_books_owner" ON "public"."books" USING "btree" ("owner_id");
CREATE INDEX IF NOT EXISTS "idx_books_status" ON "public"."books" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_messages_request" ON "public"."messages" USING "btree" ("request_id");

CREATE INDEX IF NOT EXISTS "idx_club_members_user" ON "public"."club_members" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_bookmarks_user" ON "public"."bookmarks" USING "btree" ("user_id");
