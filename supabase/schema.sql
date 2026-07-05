


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."admin_role" AS ENUM (
    'super_admin',
    'moderator',
    'viewer'
);


ALTER TYPE "public"."admin_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_area_stats"() RETURNS TABLE("area_name" character varying, "user_count" bigint, "book_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."admin_get_area_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_daily_stats"("days_back" integer DEFAULT 30) RETURNS TABLE("day" "date", "new_users" bigint, "new_books" bigint, "new_requests" bigint, "completed_exchanges" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."admin_get_daily_stats"("days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_exchange_stats"() RETURNS TABLE("total_requests" bigint, "pending_count" bigint, "accepted_count" bigint, "declined_count" bigint, "handed_over_count" bigint, "returned_count" bigint, "success_rate" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."admin_get_exchange_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_overdue_books"("threshold_days" integer DEFAULT 30) RETURNS TABLE("request_id" "uuid", "book_title" character varying, "book_author" character varying, "owner_name" character varying, "borrower_name" character varying, "handed_over_at" timestamp with time zone, "days_overdue" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."admin_get_overdue_books"("threshold_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_rating_distribution"() RETURNS TABLE("score" smallint, "count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT s.score, COALESCE(r.cnt, 0) AS count
  FROM generate_series(1, 5) AS s(score)
  LEFT JOIN (
    SELECT score, count(*) AS cnt FROM ratings GROUP BY score
  ) r ON r.score = s.score
  ORDER BY s.score;
$$;


ALTER FUNCTION "public"."admin_get_rating_distribution"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_top_contributors"("lim" integer DEFAULT 10) RETURNS TABLE("user_id" "uuid", "display_name" character varying, "area_name" character varying, "books_listed" bigint, "books_donated" bigint, "books_lent" bigint, "avg_rating" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."admin_get_top_contributors"("lim" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_book_notes_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  word_count INT;
  other_notes_count INT;
BEGIN
  word_count := array_length(regexp_split_to_array(btrim(NEW.note), '\s+'), 1);
  IF word_count > 100 THEN
    RAISE EXCEPTION 'Note exceeds the 100-word limit (got % words)', word_count;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO other_notes_count
    FROM public.book_notes
    WHERE book_id = NEW.book_id AND user_id <> NEW.user_id;

    IF other_notes_count >= 10 THEN
      RAISE EXCEPTION 'This book already has 10 community notes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_book_notes_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_club_creation_eligibility"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  completed_count INT;
  report_count INT;
BEGIN
  SELECT
    (SELECT count(*) FROM public.book_requests br
       JOIN public.books b ON b.id = br.book_id
       WHERE b.owner_id = NEW.creator_id AND br.status IN ('handed_over', 'returned'))
    +
    (SELECT count(*) FROM public.book_requests br
       WHERE br.requester_id = NEW.creator_id AND br.status IN ('handed_over', 'returned'))
  INTO completed_count;

  SELECT count(*) INTO report_count
  FROM public.reports WHERE reported_user_id = NEW.creator_id;

  IF completed_count < 5 OR report_count > 0 THEN
    RAISE EXCEPTION 'Not eligible to create a club: requires 5+ completed exchanges and a clean report record';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_club_creation_eligibility"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_book_id    uuid;
  v_reader_id  uuid;
BEGIN
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

  -- Transfer ownership; lock into donate-only, mark as in-circulation
  UPDATE public.books
     SET owner_id              = v_reader_id,
         status                = 'available',
         listing_type          = 'donate',
         acquired_via_donation = true
   WHERE id = v_book_id;

  -- Mark request returned — fires trg_increment_read_count automatically
  UPDATE public.book_requests
     SET status       = 'returned',
         completed_at = now()
   WHERE id = p_request_id;

  DELETE FROM public.book_progress
   WHERE request_id = p_request_id;
END;
$$;


ALTER FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_message_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  v_limit := public.get_platform_setting_int('max_messages_per_hour', 30);

  SELECT count(*) INTO v_count
  FROM public.messages
  WHERE sender_id = NEW.sender_id
    AND created_at > now() - interval '1 hour';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: max % messages per hour reached', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_message_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_request_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  v_limit := public.get_platform_setting_int('max_requests_per_day', 10);

  SELECT count(*) INTO v_count
  FROM public.book_requests
  WHERE requester_id = NEW.requester_id
    AND created_at > now() - interval '24 hours';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: max % requests per day reached', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_request_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) RETURNS TABLE("id" "uuid", "title" character varying, "author" character varying, "condition" character varying, "listing_type" character varying, "status" character varying, "genre" character varying, "cover_url" "text", "owner_id" "uuid", "created_at" timestamp with time zone, "distance_km" double precision, "owner_name" character varying, "owner_area" character varying, "read_count" integer, "acquired_via_donation" boolean, "description" "text", "publication_year" smallint)
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
    p.area_name AS owner_area,
    b.read_count,
    b.acquired_via_donation,
    b.description,
    b.publication_year
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


CREATE OR REPLACE FUNCTION "public"."get_platform_setting_int"("p_key" "text", "p_default" integer) RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.platform_settings WHERE key = p_key), p_default);
$$;


ALTER FUNCTION "public"."get_platform_setting_int"("p_key" "text", "p_default" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$ BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.email); -- Defaults their display name to their email
  RETURN new;
END;
 $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_read_count_on_return"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'returned' AND OLD.status IS DISTINCT FROM 'returned' THEN
    UPDATE public.books SET read_count = read_count + 1 WHERE id = NEW.book_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_read_count_on_return"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = true
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_mod"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = true
      AND admin_role IN ('super_admin', 'moderator')
  );
$$;


ALTER FUNCTION "public"."is_admin_or_mod"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = true
      AND admin_role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_wishlists_for_book"("p_title" "text", "p_owner_id" "uuid", "p_threshold" real DEFAULT 0.35) RETURNS TABLE("id" "uuid", "user_id" "uuid", "title" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT w.id, w.user_id, w.title
  FROM public.wishlists w
  WHERE w.active = true
    AND w.matched_book_id IS NULL
    AND w.user_id <> p_owner_id
    AND similarity(w.title, p_title) > p_threshold
  ORDER BY similarity(w.title, p_title) DESC;
$$;


ALTER FUNCTION "public"."match_wishlists_for_book"("p_title" "text", "p_owner_id" "uuid", "p_threshold" real) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_club_member_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE clubs SET member_count = member_count + 1 WHERE id = NEW.club_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE clubs SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.club_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_club_member_count"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "type" "text" DEFAULT 'info'::"text",
    "is_banner" boolean DEFAULT false,
    "active" boolean DEFAULT true,
    "starts_at" timestamp with time zone DEFAULT "now"(),
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "announcements_type_check" CHECK (("type" = ANY (ARRAY['info'::"text", 'warning'::"text", 'success'::"text", 'event'::"text"])))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(200) NOT NULL,
    "district" character varying(100),
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


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
    CONSTRAINT "book_requests_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('pending'::character varying)::"text", ('accepted'::character varying)::"text", ('declined'::character varying)::"text", ('handed_over'::character varying)::"text", ('returned'::character varying)::"text"])))
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
    "acquired_via_donation" boolean DEFAULT false NOT NULL,
    "read_count" integer DEFAULT 0 NOT NULL,
    "hidden_by_admin" boolean DEFAULT false,
    "admin_hide_reason" "text",
    "hidden_at" timestamp with time zone,
    "description" "text",
    "publication_year" smallint,
    CONSTRAINT "books_condition_check" CHECK ((("condition")::"text" = ANY (ARRAY[('excellent'::character varying)::"text", ('good'::character varying)::"text", ('fair'::character varying)::"text", ('poor'::character varying)::"text"]))),
    CONSTRAINT "books_lending_duration_months_check" CHECK (("lending_duration_months" = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT "books_listing_type_check" CHECK ((("listing_type")::"text" = ANY (ARRAY[('donate'::character varying)::"text", ('lend'::character varying)::"text"]))),
    CONSTRAINT "books_publication_year_check" CHECK ((("publication_year" IS NULL) OR (("publication_year" >= 1000) AND ("publication_year" <= 2200)))),
    CONSTRAINT "books_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('available'::character varying)::"text", ('unavailable'::character varying)::"text", ('given'::character varying)::"text"])))
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


CREATE TABLE IF NOT EXISTS "public"."genres" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "display_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."genres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "type" "text" DEFAULT 'admin'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_templates" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" character varying(50),
    "area_name" character varying(100),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_admin" boolean DEFAULT false,
    "latitude" double precision,
    "longitude" double precision,
    "email_digest" boolean DEFAULT true,
    "admin_role" "public"."admin_role",
    "is_banned" boolean DEFAULT false,
    "ban_reason" "text",
    "ban_expires_at" timestamp with time zone,
    "warning_count" integer DEFAULT 0,
    "last_active_at" timestamp with time zone DEFAULT "now"(),
    "bio" "text",
    CONSTRAINT "profiles_bio_check" CHECK ((("bio" IS NULL) OR ("char_length"("bio") <= 300)))
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
    "created_at" timestamp with time zone DEFAULT "now"(),
    "assigned_to" "uuid",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "category" "text" DEFAULT 'other'::"text"
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_bans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "is_permanent" boolean DEFAULT false,
    "expires_at" timestamp with time zone,
    "unbanned_at" timestamp with time zone,
    "unbanned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_bans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_warnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_warnings" OWNER TO "postgres";


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


ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notes"
    ADD CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."genres"
    ADD CONSTRAINT "genres_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."genres"
    ADD CONSTRAINT "genres_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_request_id_rater_id_key" UNIQUE ("request_id", "rater_id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_admin_notes_report" ON "public"."admin_notes" USING "btree" ("report_id");



CREATE INDEX "idx_audit_log_admin" ON "public"."admin_audit_log" USING "btree" ("admin_id");



CREATE INDEX "idx_audit_log_created" ON "public"."admin_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_log_target" ON "public"."admin_audit_log" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_bans_user" ON "public"."user_bans" USING "btree" ("user_id");



CREATE INDEX "idx_books_title_trgm" ON "public"."books" USING "gin" ("title" "public"."gin_trgm_ops");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_unique_active_request" ON "public"."book_requests" USING "btree" ("book_id", "requester_id") WHERE (("status")::"text" = ANY (ARRAY[('pending'::character varying)::"text", ('accepted'::character varying)::"text", ('handed_over'::character varying)::"text"]));



CREATE INDEX "idx_warnings_user" ON "public"."user_warnings" USING "btree" ("user_id");



CREATE INDEX "idx_wishlists_title_trgm" ON "public"."wishlists" USING "gin" ("title" "public"."gin_trgm_ops");



CREATE UNIQUE INDEX "idx_wishlists_user_title_unique" ON "public"."wishlists" USING "btree" ("user_id", "lower"("btrim"("title")));



CREATE OR REPLACE TRIGGER "trg_check_book_notes_limits" BEFORE INSERT OR UPDATE ON "public"."book_notes" FOR EACH ROW EXECUTE FUNCTION "public"."check_book_notes_limits"();



CREATE OR REPLACE TRIGGER "trg_check_club_creation_eligibility" BEFORE INSERT ON "public"."clubs" FOR EACH ROW EXECUTE FUNCTION "public"."check_club_creation_eligibility"();



CREATE OR REPLACE TRIGGER "trg_club_member_count" AFTER INSERT OR DELETE ON "public"."club_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_club_member_count"();



CREATE OR REPLACE TRIGGER "trg_enforce_message_rate_limit" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_message_rate_limit"();



CREATE OR REPLACE TRIGGER "trg_enforce_request_rate_limit" BEFORE INSERT ON "public"."book_requests" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_request_rate_limit"();



CREATE OR REPLACE TRIGGER "trg_increment_read_count" AFTER UPDATE OF "status" ON "public"."book_requests" FOR EACH ROW EXECUTE FUNCTION "public"."increment_read_count_on_return"();



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notes"
    ADD CONSTRAINT "admin_notes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notes"
    ADD CONSTRAINT "admin_notes_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_rated_user_id_fkey" FOREIGN KEY ("rated_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."book_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_book_id_fkey" FOREIGN KEY ("reported_book_id") REFERENCES "public"."books"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_unbanned_by_fkey" FOREIGN KEY ("unbanned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_matched_book_id_fkey" FOREIGN KEY ("matched_book_id") REFERENCES "public"."books"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete any book" ON "public"."books" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Admins can delete any club" ON "public"."clubs" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Admins can insert audit log" ON "public"."admin_audit_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins can insert bans" ON "public"."user_bans" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin_or_mod"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins can insert notes" ON "public"."admin_notes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin_or_mod"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins can insert notifications for anyone" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can insert warnings" ON "public"."user_warnings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin_or_mod"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins can manage announcements" ON "public"."announcements" TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can manage areas" ON "public"."areas" TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can manage genres" ON "public"."genres" TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can manage templates" ON "public"."notification_templates" TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can remove club members" ON "public"."club_members" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can update any book" ON "public"."books" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can update any club" ON "public"."clubs" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can update any profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can update any request" ON "public"."book_requests" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can update bans" ON "public"."user_bans" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can update reports" ON "public"."reports" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can view all bans" ON "public"."user_bans" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can view all books" ON "public"."books" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all messages" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all ratings" ON "public"."ratings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all reports" ON "public"."reports" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can view all requests" ON "public"."book_requests" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all warnings" ON "public"."user_warnings" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can view audit log" ON "public"."admin_audit_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view notes" ON "public"."admin_notes" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins can view templates" ON "public"."notification_templates" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_mod"());



CREATE POLICY "Admins delete books" ON "public"."books" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Admins manage book_of_month" ON "public"."book_of_month" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Anyone can read settings" ON "public"."platform_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view active announcements" ON "public"."announcements" FOR SELECT TO "authenticated", "anon" USING ((("active" = true) AND ("starts_at" <= "now"()) AND (("ends_at" IS NULL) OR ("ends_at" > "now"()))));



CREATE POLICY "Anyone can view active areas" ON "public"."areas" FOR SELECT TO "authenticated", "anon" USING (("active" = true));



CREATE POLICY "Anyone can view active clubs" ON "public"."clubs" FOR SELECT TO "authenticated", "anon" USING (("active" = true));



CREATE POLICY "Anyone can view active genres" ON "public"."genres" FOR SELECT TO "authenticated", "anon" USING (("active" = true));



CREATE POLICY "Anyone can view club posts" ON "public"."club_posts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Authenticated users can create clubs" ON "public"."clubs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Authenticated users can view book notes" ON "public"."book_notes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view club members" ON "public"."club_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view reading progress" ON "public"."book_progress" FOR SELECT TO "authenticated" USING (true);



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



CREATE POLICY "Super admins can manage settings" ON "public"."platform_settings" TO "authenticated" USING ("public"."is_super_admin"());



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



CREATE POLICY "Users insert own notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view own reports" ON "public"."reports" FOR SELECT USING (("auth"."uid"() = "reporter_id"));



ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_of_month" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."books" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."club_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."club_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."genres" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_bans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_warnings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlists" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_area_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_area_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_area_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_daily_stats"("days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_daily_stats"("days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_daily_stats"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_exchange_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_exchange_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_exchange_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_overdue_books"("threshold_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_overdue_books"("threshold_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_overdue_books"("threshold_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_rating_distribution"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_rating_distribution"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_rating_distribution"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_top_contributors"("lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_top_contributors"("lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_top_contributors"("lim" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_book_notes_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_book_notes_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_book_notes_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_club_creation_eligibility"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_club_creation_eligibility"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_club_creation_eligibility"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_donated_book_reading"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_message_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_message_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_message_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_request_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_request_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_request_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clubs_nearby"("user_lat" double precision, "user_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_setting_int"("p_key" "text", "p_default" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_setting_int"("p_key" "text", "p_default" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_setting_int"("p_key" "text", "p_default" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_read_count_on_return"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_read_count_on_return"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_read_count_on_return"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_mod"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_mod"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_mod"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_wishlists_for_book"("p_title" "text", "p_owner_id" "uuid", "p_threshold" real) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_wishlists_for_book"("p_title" "text", "p_owner_id" "uuid", "p_threshold" real) TO "anon";
GRANT ALL ON FUNCTION "public"."match_wishlists_for_book"("p_title" "text", "p_owner_id" "uuid", "p_threshold" real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_wishlists_for_book"("p_title" "text", "p_owner_id" "uuid", "p_threshold" real) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_club_member_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_club_member_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_club_member_count"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notes" TO "anon";
GRANT ALL ON TABLE "public"."admin_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notes" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."areas" TO "anon";
GRANT ALL ON TABLE "public"."areas" TO "authenticated";
GRANT ALL ON TABLE "public"."areas" TO "service_role";



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



GRANT ALL ON TABLE "public"."genres" TO "anon";
GRANT ALL ON TABLE "public"."genres" TO "authenticated";
GRANT ALL ON TABLE "public"."genres" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ratings" TO "anon";
GRANT ALL ON TABLE "public"."ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."ratings" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."user_bans" TO "anon";
GRANT ALL ON TABLE "public"."user_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_bans" TO "service_role";



GRANT ALL ON TABLE "public"."user_warnings" TO "anon";
GRANT ALL ON TABLE "public"."user_warnings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_warnings" TO "service_role";



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







