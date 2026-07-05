import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/dashboard-shell'
import AnnouncementBanner from '@/components/announcement-banner'
import { FEATURE_FLAG_KEYS, parseFeatureFlags } from '@/lib/platform-settings'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Guest: simple responsive top navbar, no sidebar
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <header className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-md bg-slate-950/80">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 max-w-7xl mx-auto">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-sm">OLK</div>
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
                className="text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-white px-3 md:px-4 py-2 rounded-lg transition-all shadow-lg shadow-teal-500/20"
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
  let displayName: string | null = null
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, is_admin')
    .eq('id', user.id)
    .single()
  displayName = profile?.display_name ?? null

  const { data: settingsRows } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', FEATURE_FLAG_KEYS)
  const featureFlags = parseFeatureFlags(settingsRows)

  return (
    <DashboardShell displayName={displayName} email={user.email ?? null} isAdmin={profile?.is_admin ?? false} featureFlags={featureFlags}>
      {children}
    </DashboardShell>
  )
}
