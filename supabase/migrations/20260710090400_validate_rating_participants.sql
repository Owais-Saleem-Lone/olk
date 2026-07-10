-- "Users can insert own ratings" only checked auth.uid() = rater_id, never
-- that rated_user_id is the real counterparty on request_id, nor that the
-- exchange actually completed. Anyone who knows/guesses a request_id UUID
-- could post a rating against an arbitrary rated_user_id, skewing
-- admin_get_top_contributors()'s avg_rating (capped at one bad rating per
-- known request_id by the existing UNIQUE(request_id, rater_id)).
DROP POLICY IF EXISTS "Users can insert own ratings" ON public.ratings;

CREATE POLICY "Users can insert own ratings"
  ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = rater_id
    AND rater_id <> rated_user_id
    AND EXISTS (
      SELECT 1 FROM public.book_requests br
      JOIN public.books b ON b.id = br.book_id
      WHERE br.id = request_id
        AND br.status IN ('handed_over', 'returned')
        AND (
          (br.requester_id = rater_id AND b.owner_id = rated_user_id)
          OR (b.owner_id = rater_id AND br.requester_id = rated_user_id)
        )
    )
  );
