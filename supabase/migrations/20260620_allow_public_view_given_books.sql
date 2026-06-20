-- Allow anonymous and authenticated users to view both available and given books
DROP POLICY IF EXISTS "Public can view available books" ON "public"."books";

CREATE POLICY "Public can view available and given books"
  ON "public"."books"
  FOR SELECT
  TO "authenticated", "anon"
  USING (("status"::text = ANY (ARRAY['available', 'given'])));
