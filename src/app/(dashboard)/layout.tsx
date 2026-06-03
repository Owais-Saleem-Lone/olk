
import Link from 'next/link'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 p-6 flex flex-col">
        <Link href="/" className="flex items-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-sm">OLK</div>
          <span className="text-lg font-semibold tracking-tight">OLK</span>
        </Link>
        
        <nav className="space-y-2 flex-1">
          <Link href="/browse" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 text-white">
            📚 Browse Books
          </Link>
          <Link href="/my-books" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white">
            ➕ My Books
          </Link>
          <Link href="/messages" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white">
            💬 Messages
          </Link>
          <Link href="/requests" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white">
            📩 Requests
          </Link>
          <Link href="/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white">
            👤 My Profile
          </Link>
        </nav>

        <div className="border-t border-white/5 pt-4">
          <Link href="/" className="text-sm text-slate-500 hover:text-white">
            ← Sign Out
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}