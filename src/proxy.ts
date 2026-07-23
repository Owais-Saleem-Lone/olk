import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { FEATURE_FLAG_KEYS, parseFeatureFlags, type FeatureFlags } from '@/lib/platform-settings'

const PROTECTED_ROUTES = ['/my-books', '/messages', '/requests', '/profile', '/user', '/saved', '/wishlist', '/clubs/create', '/admin']

// platform_settings rarely changes (an admin flipping a toggle), so cache it
// for a short window rather than querying it on every single request.
let cachedFlags: { flags: FeatureFlags; expiresAt: number } | null = null
const FLAGS_TTL_MS = 30_000

async function getFeatureFlags(supabase: SupabaseClient): Promise<FeatureFlags> {
  const now = Date.now()
  if (cachedFlags && cachedFlags.expiresAt > now) return cachedFlags.flags

  const { data } = await supabase.from('platform_settings').select('key, value').in('key', FEATURE_FLAG_KEYS)
  const flags = parseFeatureFlags(data)
  cachedFlags = { flags, expiresAt: now + FLAGS_TTL_MS }
  return flags
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route))
  const flags = await getFeatureFlags(supabase)

  // Fetched for every authenticated request (not just protected routes) because
  // DashboardLayout needs is_admin/display_name on every page too; forwarding
  // it via headers below lets the layout skip its own duplicate auth+profile
  // round trips.
  let profile: { is_banned: boolean; ban_expires_at: string | null; is_admin: boolean; admin_role: string | null; display_name: string | null } | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('is_banned, ban_expires_at, is_admin, admin_role, display_name')
      .eq('id', user.id)
      .single()
    profile = data
  }

  // Maintenance mode blocks everyone except admins. /login stays reachable so
  // an admin can still sign in, and /maintenance itself must stay reachable.
  if (flags.maintenance_mode && pathname !== '/maintenance' && pathname !== '/login' && !profile?.is_admin) {
    const maintenanceUrl = request.nextUrl.clone()
    maintenanceUrl.pathname = '/maintenance'
    return NextResponse.redirect(maintenanceUrl)
  }

  if (!flags.feature_clubs && pathname.startsWith('/clubs')) {
    const browseUrl = request.nextUrl.clone()
    browseUrl.pathname = '/browse'
    return NextResponse.redirect(browseUrl)
  }

  if (!flags.feature_wishlists && pathname.startsWith('/wishlist')) {
    const browseUrl = request.nextUrl.clone()
    browseUrl.pathname = '/browse'
    return NextResponse.redirect(browseUrl)
  }

  if (!flags.feature_messages && pathname.startsWith('/messages')) {
    const browseUrl = request.nextUrl.clone()
    browseUrl.pathname = '/browse'
    return NextResponse.redirect(browseUrl)
  }

  // Events live at /events but event *creation* is nested under /clubs/[id]/events/...,
  // so this needs both prefixes, unlike the single-prefix checks above.
  if (!flags.feature_events && (pathname.startsWith('/events') || /^\/clubs\/[^/]+\/events\//.test(pathname))) {
    const browseUrl = request.nextUrl.clone()
    browseUrl.pathname = '/browse'
    return NextResponse.redirect(browseUrl)
  }

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (user && isProtected) {
    if (profile?.is_banned) {
      const expired = profile.ban_expires_at && new Date(profile.ban_expires_at) < new Date()
      if (!expired && !pathname.startsWith('/profile')) {
        const bannedUrl = request.nextUrl.clone()
        bannedUrl.pathname = '/profile'
        return NextResponse.redirect(bannedUrl)
      }
    }

    if (pathname.startsWith('/admin') && !profile?.is_admin) {
      const browseUrl = request.nextUrl.clone()
      browseUrl.pathname = '/browse'
      return NextResponse.redirect(browseUrl)
    }
  }

  // Forward the already-verified user/profile/flags to downstream Server
  // Components via request headers, so DashboardLayout doesn't need to repeat
  // auth.getUser() + a profiles query + an uncached platform_settings query.
  // Custom values are base64-encoded since display_name may contain non-ASCII
  // characters that aren't safe as raw header values.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-olk-user-id', user?.id ?? '')
  requestHeaders.set('x-olk-user-email', user?.email ?? '')
  requestHeaders.set('x-olk-user-is-admin', profile?.is_admin ? '1' : '0')
  requestHeaders.set('x-olk-user-display-name', Buffer.from(profile?.display_name ?? '').toString('base64'))
  requestHeaders.set('x-olk-feature-flags', Buffer.from(JSON.stringify(flags)).toString('base64'))

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } })
  supabaseResponse.cookies.getAll().forEach(cookie => finalResponse.cookies.set(cookie))
  return finalResponse
}

export const config = {
  matcher: [
    // /api/books is excluded: it serves the same public, non-personalized
    // book list to everyone and needs no session/feature-flag check, so
    // running it through proxy would only add an unnecessary Auth API
    // round-trip per request.
    '/((?!api/books|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
