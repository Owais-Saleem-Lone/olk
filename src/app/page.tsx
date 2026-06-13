import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let displayName: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    displayName = profile?.display_name ?? null
  }

  const { data: featuredBooks } = await supabase
    .from('books')
    .select('id, title, author, listing_type, cover_url')
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .limit(4)

  return (
    <div className="min-h-screen bg-[#020817] text-white overflow-x-hidden">

      {/* Ambient background glow — decorative only */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-teal-500/[0.07] rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[10%] w-[400px] h-[400px] bg-cyan-600/[0.04] rounded-full blur-[100px]" />
        <div className="absolute top-[60%] right-[5%] w-[350px] h-[350px] bg-teal-400/[0.04] rounded-full blur-[90px]" />
      </div>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-md bg-[#020817]/80">
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center font-bold text-xs shadow-lg shadow-teal-500/30">
              OLK
            </div>
            <span className="font-semibold tracking-tight">Open Library Kashmir</span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link
                href="/browse"
                className="text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 rounded-lg transition-all shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30"
              >
                👤 {displayName || user.email}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 rounded-lg transition-all shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30"
                >
                  Join Now
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-teal-300 text-sm font-medium">Free • Open Source • Privacy-First</span>
        </div>

        {/* Search */}
        <form action="/browse" method="GET" className="flex items-center gap-2 max-w-lg mx-auto mb-12">
          <div className="relative flex-1">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              name="q"
              type="text"
              placeholder="Search a book or author"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-500/40 transition-all"
            />
          </div>
          <button
            type="submit"
            className="bg-teal-500 hover:bg-teal-400 text-white font-semibold px-5 py-3 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap shadow-lg shadow-teal-500/20"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Search
          </button>
        </form>

        {/* Headline */}
        <h1 className="text-6xl md:text-8xl font-bold tracking-tight leading-[1.05] mb-6">
          Share a book.
          <br />
          <span className="bg-gradient-to-r from-teal-400 via-cyan-300 to-teal-400 bg-clip-text text-transparent">
            Change a life.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          OLK connects readers across Kashmir. Donate or lend your used books,
          find your next read from someone nearby — all with maximum privacy and zero cost.
        </p>

        <Link
          href="/register"
          className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-all shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 hover:-translate-y-px"
        >
          Start Sharing Books →
        </Link>
      </section>

      {/* ── How it works ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
        <div className="text-center mb-14">
          <p className="text-teal-400 text-sm font-semibold uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-bold">Simple. Local. Free.</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              step: '01',
              title: 'List your book',
              desc: 'Add a book you want to donate or lend. Takes under a minute — just the title, condition, and your area.',
            },
            {
              step: '02',
              title: 'Someone requests it',
              desc: 'A nearby reader finds your book and sends a request. You review it and decide to accept or decline.',
            },
            {
              step: '03',
              title: 'Meet & exchange',
              desc: 'Chat through the app to coordinate, then meet locally and hand it over. No shipping, no cost.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="relative bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 hover:border-teal-500/20 transition-colors group overflow-hidden"
            >
              {/* Large step number in background */}
              <div className="absolute top-4 right-5 text-7xl font-black text-white/[0.03] group-hover:text-teal-500/[0.06] transition-colors select-none font-mono">
                {item.step}
              </div>
              <div className="relative">
                <span className="inline-block text-teal-400 text-xs font-bold uppercase tracking-widest mb-4">{item.step}</span>
                <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Books from the community ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-teal-400 text-sm font-semibold uppercase tracking-widest mb-1">From the Community</p>
            <h2 className="text-2xl md:text-3xl font-bold">Recently Added</h2>
          </div>
          <Link
            href="/browse"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-400 transition-colors group"
          >
            See all books
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
          </Link>
        </div>

        {featuredBooks && featuredBooks.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {featuredBooks.map((book) => (
              <Link href={`/browse?q=${encodeURIComponent(book.title)}`} key={book.id} className="group">
                {/* Cover */}
                <div className="aspect-[2/3] rounded-xl overflow-hidden mb-3 border border-white/[0.06] bg-gradient-to-br from-slate-800 to-slate-900 relative">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                      </svg>
                      <span className="text-slate-600 text-xs text-center leading-tight">{book.title}</span>
                    </div>
                  )}
                  {/* Listing type badge */}
                  <div className="absolute top-2 left-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
                      book.listing_type === 'donate'
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {book.listing_type === 'donate' ? 'Free' : 'Lend'}
                    </span>
                  </div>
                </div>
                {/* Info */}
                <h3 className="font-semibold text-sm leading-snug mb-0.5 group-hover:text-teal-400 transition-colors line-clamp-2">
                  {book.title}
                </h3>
                {book.author && (
                  <p className="text-xs text-slate-500 truncate">by {book.author}</p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-white/[0.08] rounded-2xl py-16 text-center text-slate-600">
            <p>Books will appear here once the community starts sharing.</p>
            <Link href="/register" className="inline-block mt-4 text-sm text-teal-500 hover:text-teal-400">
              Be the first to add one →
            </Link>
          </div>
        )}
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
        <div className="relative rounded-3xl overflow-hidden border border-teal-500/20 bg-gradient-to-br from-teal-500/10 via-cyan-500/5 to-transparent p-14 text-center">
          {/* inner glow */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#020817] via-transparent to-transparent pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to share your first book?
            </h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">
              Join readers across Kashmir already sharing knowledge, one book at a time.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 hover:-translate-y-px"
            >
              Get Started — It's Free →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.05] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center font-bold text-xs">
              OLK
            </div>
            <span className="text-sm text-slate-400 font-medium">Open Library Kashmir</span>
          </div>

          <p className="text-sm text-slate-600">Built with ❤️ for the people of Kashmir</p>

          <div className="flex items-center gap-6 text-sm text-slate-500">
            <Link href="/browse" className="hover:text-white transition-colors">Browse</Link>
            <Link href="/login" className="hover:text-white transition-colors">Login</Link>
            <Link href="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
