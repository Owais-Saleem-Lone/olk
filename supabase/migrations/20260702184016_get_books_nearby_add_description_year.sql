-- get_books_nearby has an explicit column list, so the description/
-- publication_year columns added for ISBN-scan enrichment were silently
-- dropped for any user with a profile location set (the geo-sorted path).
DROP FUNCTION IF EXISTS public.get_books_nearby(double precision, double precision);
CREATE OR REPLACE FUNCTION "public"."get_books_nearby"("user_lat" double precision, "user_lng" double precision)
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
  ORDER BY distance_km ASC NULLS LAST, b.created_at DESC;
$$;
