-- "Authenticated users can upload book covers" only checked bucket_id, not
-- object path, so any authenticated user could upload to (and, since no
-- UPDATE/DELETE policy existed either, effectively squat on) any path in the
-- bucket — including overwriting another user's cover once one existed.
-- Client code already namespaces uploads as `<userId>/<timestamp>.<ext>`
-- (see timestampedPath() in src/app/(dashboard)/my-books/page.tsx); enforce
-- that convention server-side instead of trusting the client.
DROP POLICY IF EXISTS "Authenticated users can upload book covers" ON storage.objects;

CREATE POLICY "Users can upload own book covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own book covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own book covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
