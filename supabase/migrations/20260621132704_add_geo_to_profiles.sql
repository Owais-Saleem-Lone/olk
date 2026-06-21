-- Add GPS coordinates to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- RPC function: returns available/given books with distance from a point
CREATE OR REPLACE FUNCTION get_books_nearby(user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  author VARCHAR,
  condition VARCHAR,
  listing_type VARCHAR,
  status VARCHAR,
  genre VARCHAR,
  cover_url TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ,
  distance_km DOUBLE PRECISION,
  owner_name VARCHAR,
  owner_area VARCHAR
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
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
  WHERE b.status IN ('available', 'given')
  ORDER BY distance_km ASC NULLS LAST, b.created_at DESC;
$$;
