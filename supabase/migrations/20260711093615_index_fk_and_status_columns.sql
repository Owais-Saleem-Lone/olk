-- Postgres does not auto-index foreign key columns (only primary keys get
-- one for free), and these three tables never had explicit indexes added
-- for their FK/status columns despite being queried by them constantly:
-- book_requests by book_id/requester_id/status (requests page, report-modal,
-- rating-modal), ratings by request_id/rater_id/rated_user_id (rating
-- eligibility checks, admin_get_top_contributors), reports by
-- reporter_id/reported_user_id/reported_book_id/status/assigned_to (report
-- triage queue, report-modal). Flagged by an external infra audit
-- (2026-07-11, Guide/chapters/01-welcome-and-vision.tex) and confirmed
-- against supabase/schema.sql before writing this migration.

CREATE INDEX IF NOT EXISTS "idx_book_requests_book" ON "public"."book_requests" USING "btree" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_book_requests_requester" ON "public"."book_requests" USING "btree" ("requester_id");
CREATE INDEX IF NOT EXISTS "idx_book_requests_status" ON "public"."book_requests" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_ratings_request" ON "public"."ratings" USING "btree" ("request_id");
CREATE INDEX IF NOT EXISTS "idx_ratings_rater" ON "public"."ratings" USING "btree" ("rater_id");
CREATE INDEX IF NOT EXISTS "idx_ratings_rated_user" ON "public"."ratings" USING "btree" ("rated_user_id");

CREATE INDEX IF NOT EXISTS "idx_reports_reporter" ON "public"."reports" USING "btree" ("reporter_id");
CREATE INDEX IF NOT EXISTS "idx_reports_reported_user" ON "public"."reports" USING "btree" ("reported_user_id");
CREATE INDEX IF NOT EXISTS "idx_reports_reported_book" ON "public"."reports" USING "btree" ("reported_book_id");
CREATE INDEX IF NOT EXISTS "idx_reports_status" ON "public"."reports" USING "btree" ("status");
CREATE INDEX IF NOT EXISTS "idx_reports_assigned_to" ON "public"."reports" USING "btree" ("assigned_to");
