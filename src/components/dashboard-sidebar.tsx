"use client"

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FeatureFlags } from '@/lib/platform-settings'

const NAV_ITEMS = [
  { href: '/browse', label: '📚 Browse Books' },
  { href: '/my-books', label: '➕ My Books' },
  { href: '/saved', label: '🔖 Saved Books' },
  { href: '/wishlist', label: '✨ Wishlist', flag: 'feature_wishlists' as const },
  { href: '/clubs', label: '🏘️ Clubs', flag: 'feature_clubs' as const },
  { href: '/messages', label: '💬 Messages', flag: 'feature_messages' as const },
  { href: '/requests', label: '📩 Requests' },
  { href: '/notifications', label: '🔔 Notifications' },
  { href: '/profile', label: '👤 My Profile' },
]

export default function DashboardSidebar({
  displayName,
  email,
  isAdmin,
  featureFlags,
}: {
  displayName: string | null
  email: string | null
  isAdmin: boolean
  featureFlags: FeatureFlags
}) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 h-full border-r border-white/5 p-6 flex flex-col">
      <Link href="/" className="flex items-center gap-2 mb-10">
        <div className="w-9 h-9 rounded-lg bg-brand-teal flex items-center justify-center font-bold text-sm">OLK</div>
        <span className="text-lg font-semibold tracking-tight">OLK</span>
      </Link>

      <nav className="space-y-2 flex-1">
        {NAV_ITEMS.filter(item => !item.flag || featureFlags[item.flag]).map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-white/5 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {label}
            </Link>
          )
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mt-4 border-t border-white/5 pt-4 ${
              pathname === '/admin' || pathname.startsWith('/admin/')
                ? 'bg-white/5 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            ⚙️ Admin
          </Link>
        )}
      </nav>

      <div className="border-t border-white/5 pt-4 space-y-3">
        <div className="px-1">
          <p className="text-sm font-medium text-white truncate">
            {displayName || email || 'My Account'}
          </p>
          {displayName && email && (
            <p className="text-xs text-slate-500 truncate">{email}</p>
          )}
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-500 hover:text-white transition-colors"
        >
          ← Sign Out
        </button>
      </div>
    </aside>
  )
}
