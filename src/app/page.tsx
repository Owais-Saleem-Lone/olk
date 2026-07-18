import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import BookOfMonthCard from '@/components/book-of-month'
import AboutModal from '@/components/about-modal'
import AnimatedCounter from '@/components/animated-counter'
import AnnouncementBanner from '@/components/announcement-banner'

function getTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

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
    .select('id, title, author, listing_type, status, cover_url')
    .in('status', ['available', 'given'])
    .order('created_at', { ascending: false })
    .limit(4)

  const { data: bookOfMonth } = await supabase
    .from('book_of_month')
    .select('title, author, description, cover_url, month_label')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { data: statsRow } = await supabase.rpc('get_community_stats')
  const stats = statsRow?.[0]
  const totalBooks = stats?.total_books ?? 0
  const totalUsers = stats?.total_users ?? 0
  const completedExchanges = stats?.completed_exchanges ?? 0

  const { data: recentActivity } = await supabase
    .from('books')
    .select('title, listing_type, owner_id, created_at, profiles!books_owner_id_fkey(display_name, area_name)')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: activeClubs } = await supabase
    .from('clubs')
    .select('id, name, interests, member_count')
    .eq('active', true)
    .order('member_count', { ascending: false })
    .limit(6)

  const { data: upcomingEvents } = await supabase
    .from('club_events')
    .select('id, title, starts_at, is_online, location_name, attendee_count, clubs(name)')
    .eq('active', true)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(6)

  return (
    <div className="min-h-screen bg-[#0f172a] text-white overflow-x-hidden">

      {/* Ambient background glow — decorative only */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-brand-teal/[0.07] rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[10%] w-[400px] h-[400px] bg-amber-500/[0.05] rounded-full blur-[100px]" />
        <div className="absolute top-[60%] right-[5%] w-[350px] h-[350px] bg-brand-teal-light/[0.04] rounded-full blur-[90px]" />
      </div>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-md bg-[#0f172a]/80">
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <Image
                src="/olk-logo.svg"
                alt="OLK logo"
                width={32}
                height={32}
                unoptimized
                className="rounded-full shadow-lg shadow-brand-teal/30"
              />
              <span className="font-semibold tracking-tight">Open Library Kashmir</span>
            </div>
            <AboutModal />
            <Link
              href={user ? "/clubs" : "/login"}
              className="text-sm text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              🏘️ Clubs
            </Link>
            <Link
              href={user ? "/events" : "/login"}
              className="text-sm text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              📅 Events
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link
                href="/browse"
                className="text-sm font-semibold bg-brand-teal hover:bg-brand-teal-light text-white px-4 py-2 rounded-lg transition-all shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/30"
              >
                👤 {displayName || user.email}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-slate-300 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-semibold bg-brand-teal hover:bg-brand-teal-light text-white px-4 py-2 rounded-lg transition-all shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/30"
                >
                  Join Now
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Announcement Banner ── */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-6">
        <AnnouncementBanner />
      </div>

      {/* ── Hero ── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-brand-teal/10 border border-brand-teal/20 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-teal-light animate-pulse" />
          <span className="text-teal-300 text-sm font-medium">Free • Open Source • Privacy-First</span>
        </div>

        {/* Search */}
        <form action="/browse" method="GET" className="flex items-center gap-2 max-w-lg mx-auto mb-12">
          <div className="relative flex-1">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              name="q"
              type="text"
              placeholder="Search a book or author"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal/60 focus:border-brand-teal/40 transition-all"
            />
          </div>
          <button
            type="submit"
            className="bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-5 py-3 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap shadow-lg shadow-brand-teal/20"
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
          <span className="bg-gradient-to-r from-brand-teal-light via-cyan-300 to-brand-teal-light bg-clip-text text-transparent">
            Change a life.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
          OLK connects readers across regions. Donate or lend your used books,
          find your next read from someone nearby — all with maximum privacy and zero cost.
        </p>

        <Link
          href={user ? "/my-books" : "/register"}
          className="inline-flex items-center gap-2 bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-all shadow-xl shadow-brand-teal/25 hover:shadow-brand-teal/40 hover:-translate-y-px"
        >
          Start Sharing Books →
        </Link>

        {/* ── Community Stats ── */}
        {(totalBooks > 0 || totalUsers > 0 || completedExchanges > 0) ? (
          <div className="grid grid-cols-3 gap-5 mt-16 max-w-xl mx-auto">
            {[
              { value: totalBooks ?? 0, label: 'Books Shared', color: 'text-brand-teal-light' },
              { value: totalUsers ?? 0, label: 'Readers Joined', color: 'text-cyan-400' },
              { value: completedExchanges ?? 0, label: 'Exchanges Made', color: 'text-emerald-400' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <AnimatedCounter value={stat.value} className={`text-4xl md:text-5xl font-bold ${stat.color}`} />
                <p className="text-xs text-slate-400 mt-1.5">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── Book of the Month ── */}
      {bookOfMonth && (
        <section className="relative z-10 max-w-5xl mx-auto px-6 pb-16">
          <BookOfMonthCard book={bookOfMonth} />
        </section>
      )}

      {/* ── How it works ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
        <div className="text-center mb-14">
          <p className="text-brand-teal-light text-sm font-semibold uppercase tracking-widest mb-3">How it works</p>
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
              className="relative bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 hover:border-brand-teal/20 transition-colors group overflow-hidden"
            >
              {/* Large step number in background */}
              <div className="absolute top-4 right-5 text-7xl font-black text-white/[0.03] group-hover:text-brand-teal/[0.06] transition-colors select-none font-mono">
                {item.step}
              </div>
              <div className="relative">
                <span className="inline-block text-brand-teal-light text-xs font-bold uppercase tracking-widest mb-4">{item.step}</span>
                <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recent Activity Feed ── */}
      {recentActivity && recentActivity.length > 0 && (
        <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
          <div className="text-center mb-10">
            <p className="text-brand-teal-light text-sm font-semibold uppercase tracking-widest mb-3">Live Activity</p>
            <h2 className="text-3xl md:text-4xl font-bold">Happening right now</h2>
          </div>
          <div className="space-y-3 max-w-2xl mx-auto">
            {recentActivity.map((item: { title: string; listing_type: string; created_at: string; profiles: unknown }, i: number) => {
              const profile = item.profiles as { display_name: string | null; area_name: string | null } | null
              const name = profile?.display_name?.split('@')[0] || 'Someone'
              const area = profile?.area_name
              const ago = getTimeAgo(item.created_at)
              return (
                <div key={i} className="flex items-center gap-4 bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-3.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    item.listing_type === 'donate'
                      ? 'bg-brand-teal/10 text-brand-teal-light'
                      : 'bg-blue-500/10 text-blue-400'
                  }`}>
                    {item.listing_type === 'donate' ? '🎁' : '🤝'}
                  </div>
                  <p className="text-sm text-slate-300 flex-1">
                    <span className="text-white font-medium">{name}</span>
                    {' '}{item.listing_type === 'donate' ? 'donated' : 'listed'}{' '}
                    <span className="text-brand-teal-light font-medium">{item.title}</span>
                    {area && <span className="text-slate-400"> in {area}</span>}
                  </p>
                  <span className="text-xs text-slate-500 flex-shrink-0">{ago}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Books from the community ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-brand-teal-light text-sm font-semibold uppercase tracking-widest mb-1">From the Community</p>
            <h2 className="text-2xl md:text-3xl font-bold">Recently Added</h2>
          </div>
          <Link
            href="/browse"
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-brand-teal-light transition-colors group"
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
                <div className="aspect-[2/3] rounded-xl overflow-hidden mb-3 border border-white/[0.06] bg-gradient-to-br from-brand-slate-light to-brand-slate relative">
                  {book.cover_url ? (
                    <Image
                      src={book.cover_url}
                      alt={book.title}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                      </svg>
                      <span className="text-slate-500 text-xs text-center leading-tight">{book.title}</span>
                    </div>
                  )}
                  {/* Listing type badge */}
                  <div className="absolute top-2 left-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
                      book.listing_type === 'donate'
                        ? 'bg-brand-teal/20 text-teal-300 border border-brand-teal/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {book.listing_type === 'donate' ? 'Free' : 'Lend'}
                    </span>
                  </div>
                  {book.status === 'given' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm">
                        Donated
                      </span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <h3 className="font-semibold text-sm leading-snug mb-0.5 group-hover:text-brand-teal-light transition-colors line-clamp-2">
                  {book.title}
                </h3>
                {book.author && (
                  <p className="text-xs text-slate-400 truncate">by {book.author}</p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-white/[0.08] rounded-2xl py-16 text-center text-slate-500">
            <p>Books will appear here once the community starts sharing.</p>
            <Link href="/register" className="inline-block mt-4 text-sm text-brand-teal hover:text-brand-teal-light">
              Be the first to add one →
            </Link>
          </div>
        )}
      </section>

      {/* ── Local Clubs ── */}
      {activeClubs && activeClubs.length > 0 && (
        <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-brand-teal-light text-sm font-semibold uppercase tracking-widest mb-1">Community</p>
              <h2 className="text-2xl md:text-3xl font-bold">Local Clubs</h2>
            </div>
            <Link
              href={user ? "/clubs" : "/login"}
              className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-brand-teal-light transition-colors group"
            >
              {user ? 'Browse all clubs' : 'Join to explore'}
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {activeClubs.map((club) => (
              <Link
                key={club.id}
                href={user ? `/clubs/${club.id}` : "/login"}
                className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-brand-teal/20 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-lg flex-shrink-0">
                    🏘️
                  </div>
                  <h3 className="font-semibold text-sm text-white group-hover:text-brand-teal-light transition-colors leading-snug">
                    {club.name}
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {club.interests?.[0] && (
                    <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">
                      {club.interests[0]}
                    </span>
                  )}
                  <span>{club.member_count} {club.member_count === 1 ? 'member' : 'members'}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Upcoming Events ── */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-brand-teal-light text-sm font-semibold uppercase tracking-widest mb-1">Community</p>
              <h2 className="text-2xl md:text-3xl font-bold">Upcoming Events</h2>
            </div>
            <Link
              href={user ? "/events" : "/login"}
              className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-brand-teal-light transition-colors group"
            >
              {user ? 'See all events' : 'Join to explore'}
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {upcomingEvents.map((ev) => {
              const club = ev.clubs as unknown as { name: string } | null
              return (
                <Link
                  key={ev.id}
                  href={user ? `/events/${ev.id}` : "/login"}
                  className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-brand-teal/20 transition-colors group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-lg flex-shrink-0">
                      📅
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-white group-hover:text-brand-teal-light transition-colors leading-snug truncate">
                        {ev.title}
                      </h3>
                      {club && <p className="text-xs text-slate-500 truncate">{club.name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{new Date(ev.starts_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    <span>{ev.is_online ? '💻 Online' : (ev.location_name || 'In person')}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Final CTA ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
        <div className="relative rounded-3xl overflow-hidden border border-brand-teal/20 bg-gradient-to-br from-brand-teal/10 via-cyan-500/5 to-transparent p-14 text-center">
          {/* inner glow */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-transparent pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to share your first book?
            </h2>
            <p className="text-slate-300 mb-8 max-w-md mx-auto leading-relaxed">
              Join readers across Kashmir already sharing knowledge, one book at a time.
            </p>
            <Link
              href={user ? "/my-books" : "/register"}
              className="inline-flex items-center gap-2 bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-xl shadow-brand-teal/25 hover:shadow-brand-teal/40 hover:-translate-y-px"
            >
              {user ? 'Start Sharing Books →' : 'Get Started — It\'s Free →'}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.05] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Image
              src="/olk-logo.svg"
              alt="OLK logo"
              width={28}
              height={28}
              unoptimized
              className="rounded-full"
            />
            <span className="text-sm text-slate-300 font-medium">Open Library Kashmir</span>
          </div>

          <p className="text-sm text-slate-500">Built with ❤️ for the people of Kashmir</p>

          <div className="flex items-center gap-6 text-sm text-slate-400">
            <Link href="/browse" className="hover:text-white transition-colors">Browse</Link>
            <Link href="/login" className="hover:text-white transition-colors">Login</Link>
            <Link href="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
