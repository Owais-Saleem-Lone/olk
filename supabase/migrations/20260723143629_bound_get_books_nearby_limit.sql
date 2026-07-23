-- get_books_nearby had no LIMIT at all: every call computed a haversine
-- distance for and sorted the *entire* books table, then returned it in
-- full. That's a full-table, CPU-bound scan on every /browse load for any
-- user with a saved location, and it only gets worse as the catalog grows.
-- Adds an optional p_limit (default 200) so callers get a bounded result
-- set without changing the existing call signature for callers that don't
-- pass it. Real pagination (range/offset) is a follow-up, not done here.
--
-- Adding a parameter makes Postgres register a new overload rather than
-- replacing the existing function (confirmed via a local db reset: both
-- signatures existed afterwards, with the original 2-arg one -- the one the
-- app actually calls -- still missing the LIMIT). Drop it first so there's
-- only ever one get_books_nearby.
DROP FUNCTION IF EXISTS public.get_books_nearby(double precision, double precision);

CREATE OR REPLACE FUNCTION "public"."get_books_nearby"(
  "user_lat" double precision,
  "user_lng" double precision,
  "p_limit" integer DEFAULT 200
)
RETURNS TABLE(
  "id"                    uuid,
  "title"                 character varying,
  "author"                character varying,
  "condition"             character varying,
  "listing_type"          character varying,
  "status"                character varying,
  "genre"                 character varying,
  "cover_url"             text,
  "owner_id"              uuid,
  "created_at"            timestamp with time zone,
  "distance_km"           double precision,
  "owner_name"            character varying,
  "owner_area"            character varying,
  "read_count"            integer,
  "acquired_via_donation" boolean,
  "description"           text,
  "publication_year"      smallint
)
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
  ORDER BY distance_km ASC NULLS LAST, b.created_at DESC
  LIMIT p_limit;
$$;
