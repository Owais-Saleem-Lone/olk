"use client"

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FeatureFlags } from '@/lib/platform-settings'

const NAV_ITEMS = [
  { href: '/browse', label: '📚 Browse Books' },
  { href: '/my-books', label: '➕ My Books' },
  { href: '/saved', label: '🔖 Saved Books' },
  { href: '/wishlist', label: '✨ Wishlist', flag: 'feature_wishlists' as const },
  { href: '/clubs', label: '🏘️ Clubs', flag: 'feature_clubs' as const },
  { href: '/events', label: '📅 Events', flag: 'feature_events' as const },
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
    <aside className="w-64 h-full border-r border-black/5 p-6 flex flex-col">
      <Link href="/" className="flex items-center gap-2 mb-10">
        <Image src="/olk-logo.svg" alt="OLK logo" width={36} height={36} unoptimized className="rounded-full" />
        <span className="text-lg font-semibold tracking-tight">OLK</span>
      </Link>

      <nav className="space-y-2 flex-1">
        {NAV_ITEMS.filter(item => !item.flag || featureFlags[item.flag]).map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors font-medium ${
                isActive
                  ? 'bg-brand-teal/10 text-brand-teal-dark'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
            </Link>
          )
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mt-4 border-t border-black/5 pt-4 font-medium ${
              pathname === '/admin' || pathname.startsWith('/admin/')
                ? 'bg-amber-50 text-amber-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            ⚙️ Admin
          </Link>
        )}
      </nav>

      <div className="border-t border-black/5 pt-4 space-y-3">
        <div className="px-1">
          <p className="text-sm font-medium text-slate-900 truncate">
            {displayName || email || 'My Account'}
          </p>
          {displayName && email && (
            <p className="text-xs text-slate-500 truncate">{email}</p>
          )}
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          ← Sign Out
        </button>
      </div>
    </aside>
  )
}
