


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_book_id    uuid;
  v_reader_id  uuid;
BEGIN
  -- Validate: caller must be the requester of a handed-over donation
  SELECT br.book_id, br.requester_id
    INTO v_book_id, v_reader_id
    FROM public.book_requests br
    JOIN public.books b ON b.id = br.book_id
   WHERE br.id            = p_request_id
     AND br.status        = 'handed_over'
     AND b.listing_type   = 'donate'
     AND br.requester_id  = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not authorised';
  END IF;

  -- Transfer ownership; book re-enters the pool under the reader
  UPDATE public.books
     SET owner_id = v_reader_id,
         status   = 'available'
   WHERE id = v_book_id;

  -- Close out the original request
  UPDATE public.book_requests
     SET status       = 'returned',
         completed_at = now()
   WHERE id = p_request_id;

  -- Remove the progress record (fresh start for the next reader)
  DELETE FROM public.book_progress
   WHERE request_id = p_request_id;
END;
$$;


ALTER FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) RETURNS TABLE("id" "uuid", "title" character varying, "author" character varying, "condition" character varying, "listing_type" character varying, "status" character varying, "genre" character varying, "cover_url" "text", "owner_id" "uuid", "created_at" timestamp with time zone, "distance_km" double precision, "owner_name" character varying, "owner_area" character varying)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    b.id, b.title, b.author, b.condition, b.listing_type, b.status,
    b.genre, b.cover_url, b.owner_id, b.created_at,
    CASE
      WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL THEN
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(user_lat)) * cos(radians(p.latitude)) *
            cos(radians(p.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(p.latitude))
          ))
        )
      ELSE NULL
    END AS distance_km,
    p.display_name AS owner_name,
    p.area_name AS owner_area
  FROM books b
  JOIN profiles p ON p.id = b.owner_id
  WHERE b.status IN ('available', 'given', 'unavailable')
  ORDER BY distance_km ASC NULLS LAST, b.created_at DESC;
$$;


ALTER FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) RETURNS TABLE("id" "uuid", "name" character varying, "description" "text", "interest" character varying, "area_name" character varying, "cover_url" "text", "creator_id" "uuid", "member_count" integer, "created_at" timestamp with time zone, "distance_km" double precision, "creator_name" character varying)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    c.id, c.name, c.description, c.interest, c.area_name,
    c.cover_url, c.creator_id, c.member_count, c.created_at,
    CASE
      WHEN c.latitude IS NOT NULL AND c.longitude IS NOT NULL THEN
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(user_lat)) * cos(radians(c.latitude)) *
            cos(radians(c.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(c.latitude))
          ))
        )
      ELSE NULL
    END AS distance_km,
    p.display_name AS creator_name
  FROM clubs c
  JOIN profiles p ON p.id = c.creator_id
  WHERE c.active = true
  ORDER BY distance_km ASC NULLS LAST, c.member_count DESC;
$$;


ALTER FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_community_stats"() RETURNS TABLE("total_books" bigint, "total_users" bigint, "completed_exchanges" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    (SELECT COUNT(*) FROM public.books)::bigint,
    (SELECT COUNT(*) FROM public.profiles)::bigint,
    (SELECT COUNT(*) FROM public.book_requests
       WHERE status IN ('handed_over', 'returned'))::bigint;
$$;


ALTER FUNCTION "public"."get_community_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$ BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.email); -- Defaults their display name to their email
  RETURN new;
END;
 $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."book_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "book_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."book_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."book_of_month" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "author" "text",
    "description" "text",
    "cover_url" "text",
    "month_label" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."book_of_month" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."book_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "book_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "reader_id" "uuid" NOT NULL,
    "progress_pct" smallint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "book_progress_progress_pct_check" CHECK ((("progress_pct" >= 0) AND ("progress_pct" <= 100)))
);


ALTER TABLE "public"."book_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."book_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "book_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "handed_over_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "book_requests_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'declined'::character varying, 'handed_over'::character varying, 'returned'::character varying])::"text"[])))
);


ALTER TABLE "public"."book_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "book_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."books" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "title" character varying(500) NOT NULL,
    "author" character varying(500),
    "condition" character varying(20),
    "listing_type" character varying(10) NOT NULL,
    "status" character varying(20) DEFAULT 'available'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "genre" character varying(100),
    "cover_url" "text",
    "lending_duration_months" smallint,
    CONSTRAINT "books_condition_check" CHECK ((("condition")::"text" = ANY ((ARRAY['excellent'::character varying, 'good'::character varying, 'fair'::character varying, 'poor'::character varying])::"text"[]))),
    CONSTRAINT "books_lending_duration_months_check" CHECK (("lending_duration_months" = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT "books_listing_type_check" CHECK ((("listing_type")::"text" = ANY ((ARRAY['donate'::character varying, 'lend'::character varying])::"text"[]))),
    CONSTRAINT "books_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['available'::character varying, 'unavailable'::character varying, 'given'::character varying])::"text"[])))
);


ALTER TABLE "public"."books" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."club_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."club_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."club_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."club_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(200) NOT NULL,
    "description" "text",
    "interest" character varying(100),
    "area_name" character varying(200),
    "latitude" double precision,
    "longitude" double precision,
    "cover_url" "text",
    "creator_id" "uuid" NOT NULL,
    "member_count" integer DEFAULT 1,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" character varying(50),
    "area_name" character varying(100),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_admin" boolean DEFAULT false,
    "latitude" double precision,
    "longitude" double precision,
    "email_digest" boolean DEFAULT true
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "rater_id" "uuid" NOT NULL,
    "rated_user_id" "uuid" NOT NULL,
    "score" smallint NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ratings_score_check" CHECK ((("score" >= 1) AND ("score" <= 5)))
);


ALTER TABLE "public"."ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_user_id" "uuid",
    "reported_book_id" "uuid",
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wishlists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "author" "text",
    "genre" character varying(100),
    "active" boolean DEFAULT true,
    "matched_book_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wishlists" OWNER TO "postgres";


ALTER TABLE ONLY "public"."book_notes"
    ADD CONSTRAINT "book_notes_book_user_unique" UNIQUE ("book_id", "user_id");



ALTER TABLE ONLY "public"."book_notes"
    ADD CONSTRAINT "book_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."book_of_month"
    ADD CONSTRAINT "book_of_month_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."book_progress"
    ADD CONSTRAINT "book_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."book_progress"
    ADD CONSTRAINT "book_progress_request_unique" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."book_requests"
    ADD CONSTRAINT "book_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_user_id_book_id_key" UNIQUE ("user_id", "book_id");



ALTER TABLE ONLY "public"."books"
    ADD CONSTRAINT "books_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."club_members"
    ADD CONSTRAINT "club_members_club_id_user_id_key" UNIQUE ("club_id", "user_id");



ALTER TABLE ONLY "public"."club_members"
    ADD CONSTRAINT "club_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."club_posts"
    ADD CONSTRAINT "club_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_request_id_rater_id_key" UNIQUE ("request_id", "rater_id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_unique_active_request" ON "public"."book_requests" USING "btree" ("book_id", "requester_id") WHERE (("status")::"text" = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'handed_over'::character varying])::"text"[]));



ALTER TABLE ONLY "public"."book_notes"
    ADD CONSTRAINT "book_notes_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."book_notes"
    ADD CONSTRAINT "book_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."book_progress"
    ADD CONSTRAINT "book_progress_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."book_progress"
    ADD CONSTRAINT "book_progress_reader_id_fkey" FOREIGN KEY ("reader_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."book_progress"
    ADD CONSTRAINT "book_progress_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."book_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."book_requests"
    ADD CONSTRAINT "book_requests_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."book_requests"
    ADD CONSTRAINT "book_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."books"
    ADD CONSTRAINT "books_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_members"
    ADD CONSTRAINT "club_members_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_members"
    ADD CONSTRAINT "club_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_posts"
    ADD CONSTRAINT "club_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_posts"
    ADD CONSTRAINT "club_posts_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."book_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_rated_user_id_fkey" FOREIGN KEY ("rated_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."book_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_book_id_fkey" FOREIGN KEY ("reported_book_id") REFERENCES "public"."books"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_matched_book_id_fkey" FOREIGN KEY ("matched_book_id") REFERENCES "public"."books"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins delete books" ON "public"."books" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Admins manage book_of_month" ON "public"."book_of_month" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Admins update profiles" ON "public"."profiles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."is_admin" = true)))));



CREATE POLICY "Admins update reports" ON "public"."reports" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Admins view all reports" ON "public"."reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Anyone can view active clubs" ON "public"."clubs" FOR SELECT TO "authenticated", "anon" USING (("active" = true));



CREATE POLICY "Anyone can view club posts" ON "public"."club_posts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Authenticated users can create clubs" ON "public"."clubs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Authenticated users can view book notes" ON "public"."book_notes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view club members" ON "public"."club_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view reading progress" ON "public"."book_progress" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Author can delete own posts" ON "public"."club_posts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "author_id"));



CREATE POLICY "Book owners can update requests" ON "public"."book_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."books"
  WHERE (("books"."id" = "book_requests"."book_id") AND ("books"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Books are viewable by authenticated users" ON "public"."books" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Club creator can post" ON "public"."club_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "author_id") AND (EXISTS ( SELECT 1
   FROM "public"."clubs"
  WHERE (("clubs"."id" = "club_posts"."club_id") AND ("clubs"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Creator can delete own club" ON "public"."clubs" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Creator can update own club" ON "public"."clubs" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Profiles are viewable by authenticated users" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public can view available and given books" ON "public"."books" FOR SELECT TO "authenticated", "anon" USING ((("status")::"text" = ANY (ARRAY['available'::"text", 'given'::"text"])));



CREATE POLICY "Public can view book of month" ON "public"."book_of_month" FOR SELECT USING (true);



CREATE POLICY "Reader can delete own progress" ON "public"."book_progress" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "reader_id"));



CREATE POLICY "Reader can insert own progress" ON "public"."book_progress" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reader_id"));



CREATE POLICY "Reader can update own progress" ON "public"."book_progress" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "reader_id")) WITH CHECK (("auth"."uid"() = "reader_id"));



CREATE POLICY "Users can create requests" ON "public"."book_requests" FOR INSERT TO "authenticated" WITH CHECK (("requester_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own book notes" ON "public"."book_notes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own bookmarks" ON "public"."bookmarks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own books" ON "public"."books" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own wishlists" ON "public"."wishlists" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own book notes" ON "public"."book_notes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own bookmarks" ON "public"."bookmarks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own books" ON "public"."books" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own ratings" ON "public"."ratings" FOR INSERT WITH CHECK (("auth"."uid"() = "rater_id"));



CREATE POLICY "Users can insert own wishlists" ON "public"."wishlists" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can join clubs" ON "public"."club_members" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can leave clubs" ON "public"."club_members" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."clubs"
  WHERE (("clubs"."id" = "club_members"."club_id") AND ("clubs"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Users can send messages for their requests" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."book_requests" "br"
     JOIN "public"."books" "b" ON (("b"."id" = "br"."book_id")))
  WHERE (("br"."id" = "messages"."request_id") AND (("br"."requester_id" = "auth"."uid"()) OR ("b"."owner_id" = "auth"."uid"()))))) AND ("sender_id" = "auth"."uid"())));



CREATE POLICY "Users can update own book notes" ON "public"."book_notes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own books" ON "public"."books" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own wishlists" ON "public"."wishlists" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view all ratings" ON "public"."ratings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view messages for their requests" ON "public"."messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."book_requests" "br"
     JOIN "public"."books" "b" ON (("b"."id" = "br"."book_id")))
  WHERE (("br"."id" = "messages"."request_id") AND (("br"."requester_id" = "auth"."uid"()) OR ("b"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view own bookmarks" ON "public"."bookmarks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own wishlists" ON "public"."wishlists" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view relevant requests" ON "public"."book_requests" FOR SELECT TO "authenticated" USING ((("requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."books"
  WHERE (("books"."id" = "book_requests"."book_id") AND ("books"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "Users create reports" ON "public"."reports" FOR INSERT WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "Users read own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view own reports" ON "public"."reports" FOR SELECT USING (("auth"."uid"() = "reporter_id"));



ALTER TABLE "public"."book_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_of_month" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."books" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."club_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."club_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlists" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


















GRANT ALL ON TABLE "public"."book_notes" TO "anon";
GRANT ALL ON TABLE "public"."book_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."book_notes" TO "service_role";



GRANT ALL ON TABLE "public"."book_of_month" TO "anon";
GRANT ALL ON TABLE "public"."book_of_month" TO "authenticated";
GRANT ALL ON TABLE "public"."book_of_month" TO "service_role";



GRANT ALL ON TABLE "public"."book_progress" TO "anon";
GRANT ALL ON TABLE "public"."book_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."book_progress" TO "service_role";



GRANT ALL ON TABLE "public"."book_requests" TO "anon";
GRANT ALL ON TABLE "public"."book_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."book_requests" TO "service_role";



GRANT ALL ON TABLE "public"."bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."books" TO "anon";
GRANT ALL ON TABLE "public"."books" TO "authenticated";
GRANT ALL ON TABLE "public"."books" TO "service_role";



GRANT ALL ON TABLE "public"."club_members" TO "anon";
GRANT ALL ON TABLE "public"."club_members" TO "authenticated";
GRANT ALL ON TABLE "public"."club_members" TO "service_role";



GRANT ALL ON TABLE "public"."club_posts" TO "anon";
GRANT ALL ON TABLE "public"."club_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."club_posts" TO "service_role";



GRANT ALL ON TABLE "public"."clubs" TO "anon";
GRANT ALL ON TABLE "public"."clubs" TO "authenticated";
GRANT ALL ON TABLE "public"."clubs" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ratings" TO "anon";
GRANT ALL ON TABLE "public"."ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."ratings" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."wishlists" TO "anon";
GRANT ALL ON TABLE "public"."wishlists" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlists" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































