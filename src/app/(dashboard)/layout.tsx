import Link from 'next/link'
import { headers } from 'next/headers'
import DashboardShell from '@/components/dashboard-shell'
import AnnouncementBanner from '@/components/announcement-banner'
import Toaster from '@/components/toaster'
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from '@/lib/platform-settings'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // proxy.ts already ran auth.getUser() + the profile/platform_settings
  // lookups for this request and forwarded the results via headers, so this
  // layout doesn't need to repeat any of that Supabase round-tripping.
  const hdrs = await headers()
  const userId = hdrs.get('x-olk-user-id') || null
  const userEmail = hdrs.get('x-olk-user-email') || null
  const isAdmin = hdrs.get('x-olk-user-is-admin') === '1'
  const displayNameHeader = hdrs.get('x-olk-user-display-name')
  const displayName = displayNameHeader
    ? Buffer.from(displayNameHeader, 'base64').toString('utf-8') || null
    : null
  const flagsHeader = hdrs.get('x-olk-feature-flags')
  const featureFlags: FeatureFlags = flagsHeader
    ? JSON.parse(Buffer.from(flagsHeader, 'base64').toString('utf-8'))
    : DEFAULT_FEATURE_FLAGS

  // Guest: simple responsive top navbar, no sidebar
  if (!userId) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <header className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-md bg-slate-950/80">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 max-w-7xl mx-auto">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-teal flex items-center justify-center font-bold text-sm">OLK</div>
              <span className="font-semibold tracking-tight text-sm md:text-base">Open Library Kashmir</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="text-sm text-slate-400 hover:text-white transition-colors px-3 md:px-4 py-2 rounded-lg hover:bg-white/5"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="text-sm font-semibold bg-brand-teal hover:bg-brand-teal-light text-white px-3 md:px-4 py-2 rounded-lg transition-all shadow-lg shadow-brand-teal/20"
              >
                Join Now
              </Link>
            </div>
          </div>
        </header>
        <main className="p-4 md:p-8 max-w-7xl mx-auto">
          <AnnouncementBanner />
          {children}
        </main>
      </div>
    )
  }

  // Authenticated: sidebar layout (shell handles mobile/desktop switching)
  return (
    <DashboardShell displayName={displayName} email={userEmail} isAdmin={isAdmin} featureFlags={featureFlags}>
      {children}
      <Toaster />
    </DashboardShell>
  )
}
