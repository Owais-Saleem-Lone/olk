import { createClient } from '@supabase/supabase-js'

// Serves the plain "browse with no search/filters" book list — identical
// for every visitor, so it's safe to share across requests/users. Anything
// personalized (per-user location sort, isRequested/isBookmarked flags,
// search/filter results) is NOT served from here and stays a direct,
// per-user Supabase query in the browse page. Books change often enough
// (new listings) that the TTL is kept short rather than matching the 30s
// used for platform_settings in proxy.ts.
const CACHE_TTL_MS = 20_000

let cached: { data: unknown[]; expiresAt: number } | null = null

export async function GET() {
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return Response.json(cached.data)
  }

  // Anon key, no cookies/session — RLS still applies, and the result must
  // never depend on who's asking (that's what makes it cacheable).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase
    .from('books')
    .select('*')
    .in('status', ['available', 'given', 'unavailable'])
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  cached = { data: data ?? [], expiresAt: now + CACHE_TTL_MS }
  return Response.json(cached.data)
}
