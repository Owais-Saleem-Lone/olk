"use client"

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/browse', label: '📚 Browse Books' },
  { href: '/my-books', label: '➕ My Books' },
  { href: '/messages', label: '💬 Messages' },
  { href: '/requests', label: '📩 Requests' },
  { href: '/profile', label: '👤 My Profile' },
]

export default function DashboardSidebar({
  displayName,
  email,
}: {
  displayName: string | null
  email: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 h-full border-r border-white/5 p-6 flex flex-col">
      <Link href="/" className="flex items-center gap-2 mb-10">
        <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-sm">OLK</div>
        <span className="text-lg font-semibold tracking-tight">OLK</span>
      </Link>

      <nav className="space-y-2 flex-1">
        {NAV_ITEMS.map(({ href, label }) => {
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
