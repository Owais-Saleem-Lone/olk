'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AdminRole } from '@/lib/admin'

const NAV_SECTIONS = [
  { href: '/admin', label: 'Overview', icon: '📊', minRole: 'viewer' as AdminRole },
  { href: '/admin/users', label: 'Users', icon: '👥', minRole: 'viewer' as AdminRole },
  { href: '/admin/books', label: 'Books', icon: '📚', minRole: 'viewer' as AdminRole },
  { href: '/admin/requests', label: 'Requests', icon: '📩', minRole: 'viewer' as AdminRole },
  { href: '/admin/reports', label: 'Reports', icon: '🚩', minRole: 'moderator' as AdminRole },
  { href: '/admin/clubs', label: 'Clubs', icon: '🏘️', minRole: 'viewer' as AdminRole },
  { href: '/admin/events', label: 'Events', icon: '📅', minRole: 'viewer' as AdminRole },
  { href: '/admin/content', label: 'Content', icon: '📝', minRole: 'moderator' as AdminRole },
  { href: '/admin/notifications', label: 'Notify', icon: '🔔', minRole: 'moderator' as AdminRole },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️', minRole: 'super_admin' as AdminRole },
]

const HIERARCHY: Record<AdminRole, number> = { viewer: 0, moderator: 1, super_admin: 2 }

export default function AdminNav({ role }: { role: AdminRole }) {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
      {NAV_SECTIONS
        .filter(n => HIERARCHY[role] >= HIERARCHY[n.minRole])
        .map(n => {
          const isActive = n.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          )
        })}
    </div>
  )
}
