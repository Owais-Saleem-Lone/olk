-- createNotification() (src/lib/notifications.ts) only checked that the
-- caller was *authenticated*, then wrote with the service-role client to
-- whatever userId/title/link the client passed in. Any logged-in user could
-- call the server action directly with an arbitrary userId to spam/phish
-- another user with a fake notification. This RPC centralizes the real
-- relationship check server-side (SECURITY DEFINER so it can see rows RLS
-- would otherwise hide, e.g. another user's wishlist row) so it can't be
-- bypassed by calling the server action with fabricated context ids.
CREATE OR REPLACE FUNCTION public.can_notify(
  p_target_user uuid,
  p_context_type text,
  p_context_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_requester uuid;
  v_owner uuid;
  v_creator uuid;
BEGIN
  IF v_caller IS NULL OR v_caller = p_target_user OR p_context_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_context_type = 'request' THEN
    SELECT br.requester_id, b.owner_id INTO v_requester, v_owner
    FROM public.book_requests br
    JOIN public.books b ON b.id = br.book_id
    WHERE br.id = p_context_id;

    RETURN v_requester IS NOT NULL
      AND ((v_caller = v_requester AND p_target_user = v_owner)
        OR (v_caller = v_owner AND p_target_user = v_requester));

  ELSIF p_context_type = 'club_join' THEN
    SELECT creator_id INTO v_creator FROM public.clubs WHERE id = p_context_id;

    RETURN v_creator IS NOT NULL
      AND v_creator = p_target_user
      AND EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_context_id AND user_id = v_caller
      );

  ELSIF p_context_type = 'club_announcement' THEN
    SELECT creator_id INTO v_creator FROM public.clubs WHERE id = p_context_id;

    RETURN v_creator IS NOT NULL
      AND v_caller = v_creator
      AND EXISTS (
        SELECT 1 FROM public.club_members
        WHERE club_id = p_context_id AND user_id = p_target_user
      );

  ELSIF p_context_type = 'wishlist_match' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.wishlists w
      JOIN public.books b ON b.id = w.matched_book_id
      WHERE w.id = p_context_id AND w.user_id = p_target_user AND b.owner_id = v_caller
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_notify(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_notify(uuid, text, uuid) TO authenticated;
