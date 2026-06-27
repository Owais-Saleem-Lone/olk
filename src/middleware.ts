import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_ROUTES = ['/my-books', '/messages', '/requests', '/profile', '/user', '/saved', '/wishlist', '/clubs/create', '/admin']

export async function middleware(request: NextRequest) {
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

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (user && isProtected) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_banned, ban_expires_at, is_admin, admin_role')
      .eq('id', user.id)
      .single()

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