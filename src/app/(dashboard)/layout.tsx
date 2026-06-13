import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import DashboardSidebar from '@/components/dashboard-sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Guest: simple top navbar, no sidebar
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <header className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-md bg-slate-950/80">
          <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-sm">OLK</div>
              <span className="font-semibold tracking-tight">Open Library Kashmir</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 rounded-lg transition-all shadow-lg shadow-teal-500/20"
              >
                Join Now
              </Link>
            </div>
          </div>
        </header>
        <main className="p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    )
  }

  // Authenticated: full sidebar layout
  let displayName: string | null = null
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()
  displayName = profile?.display_name ?? null

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <DashboardSidebar
        displayName={displayName}
        email={user.email ?? null}
      />
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
