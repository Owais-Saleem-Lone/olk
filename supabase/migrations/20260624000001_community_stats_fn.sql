-- Public aggregate stats for the landing page.
-- SECURITY DEFINER lets it count rows regardless of the caller's RLS policies.
-- Only aggregate counts are exposed — no individual row data leaks.
CREATE OR REPLACE FUNCTION public.get_community_stats()
RETURNS TABLE(total_books bigint, total_users bigint, completed_exchanges bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.books)::bigint,
    (SELECT COUNT(*) FROM public.profiles)::bigint,
    (SELECT COUNT(*) FROM public.book_requests
       WHERE status IN ('handed_over', 'returned'))::bigint;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_stats() TO authenticated;
