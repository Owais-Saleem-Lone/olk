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

  let profile: { is_banned: boolean; ban_expires_at: string | null; is_admin: boolean; admin_role: string | null } | null = null
  if (user && (isProtected || flags.maintenance_mode)) {
    const { data } = await supabase
      .from('profiles')
      .select('is_banned, ban_expires_at, is_admin, admin_role')
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

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
