"use client"

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import DashboardSidebar from './dashboard-sidebar'
import NotificationBell from './notification-bell'
import AnnouncementBanner from './announcement-banner'

export default function DashboardShell({
  displayName,
  email,
  isAdmin,
  children,
}: {
  displayName: string | null
  email: string | null
  isAdmin: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close sidebar whenever the route changes (nav link tapped, sign out, etc.)
  useEffect(() => { setOpen(false) }, [pathname])

  // Lock background scroll while drawer is open on mobile
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <div className="min-h-screen bg-slate-950 text-white md:flex">

      {/* ── Mobile top bar (hidden on desktop) ── */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-slate-950/95 backdrop-blur-sm border-b border-white/5">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-xs">OLK</div>
          <span className="font-semibold tracking-tight text-sm">Open Library Kashmir</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            aria-label="Open navigation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Backdrop (mobile only, when drawer is open) ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50 bg-slate-950',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
          'md:relative md:translate-x-0 md:flex md:flex-shrink-0',
        ].join(' ')}
      >
        {/* Close button — only visible on mobile */}
        <button
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          aria-label="Close navigation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>

        <DashboardSidebar displayName={displayName} email={email} isAdmin={isAdmin} />
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto min-w-0 relative">
        <div className="hidden md:block absolute top-6 right-8 z-20">
          <NotificationBell />
        </div>
        <AnnouncementBanner />
        {children}
      </main>
    </div>
  )
}
