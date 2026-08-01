import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import BookOfMonthCard from '@/components/book-of-month'
import CommunityShelf from '@/components/community-shelf'
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

const SHELF_SPINES = [
  { h: 'h-28', c: 'bg-teal-500' },
  { h: 'h-36', c: 'bg-amber-400' },
  { h: 'h-24', c: 'bg-rose-400' },
  { h: 'h-40', c: 'bg-violet-400' },
  { h: 'h-32', c: 'bg-teal-700' },
  { h: 'h-20', c: 'bg-amber-600' },
  { h: 'h-36', c: 'bg-sky-400' },
  { h: 'h-28', c: 'bg-rose-300' },
]

const STEPS = [
  {
    step: '01',
    title: 'List your book',
    desc: 'Add a book you want to donate or lend — title, condition, and your area. Under a minute.',
    color: 'text-teal-600 bg-teal-50 border-teal-100',
  },
  {
    step: '02',
    title: 'Someone requests it',
    desc: 'A nearby reader finds your book and sends a request. You decide to accept or decline.',
    color: 'text-amber-600 bg-amber-50 border-amber-100',
  },
  {
    step: '03',
    title: 'Meet & exchange',
    desc: 'Chat in-app to coordinate, then meet locally and hand it over. No shipping, no cost.',
    color: 'text-rose-500 bg-rose-50 border-rose-100',
  },
]

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

  const { data: communityShelfBooks } = await supabase
    .from('books')
    .select('id, title, author, cover_url, listing_type')
    .eq('featured', true)
    .order('featured_at', { ascending: true })
    .limit(5)

  return (
    <div className="min-h-screen bg-[#FBF6EC] text-slate-900 overflow-x-hidden">

      {/* Ambient background glow — decorative only */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-teal-300/[0.14] rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[8%] w-[400px] h-[400px] bg-amber-300/[0.16] rounded-full blur-[110px]" />
        <div className="absolute top-[65%] right-[5%] w-[380px] h-[380px] bg-rose-200/[0.16] rounded-full blur-[100px]" />
      </div>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-black/[0.06] backdrop-blur-md bg-[#FBF6EC]/85">
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <Image
                src="/olk-logo.svg"
                alt="OLK logo"
                width={32}
                height={32}
                unoptimized
                className="rounded-full shadow-lg shadow-teal-500/20"
              />
              <span className="font-semibold tracking-tight">Open Library Kashmir</span>
            </div>
            <AboutModal />
            <Link
              href={user ? "/clubs" : "/login"}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5"
            >
              🏘️ Clubs
            </Link>
            <Link
              href={user ? "/events" : "/login"}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5"
            >
              📅 Events
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link
                href="/browse"
                className="text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg transition-all shadow-lg shadow-teal-600/20 hover:shadow-teal-600/30"
              >
                👤 {displayName || user.email}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors px-4 py-2 rounded-lg hover:bg-black/5"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg transition-all shadow-lg shadow-teal-600/20 hover:shadow-teal-600/30"
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

      {/* ── Local Clubs & Upcoming Events ── */}
      {((activeClubs && activeClubs.length > 0) || (upcomingEvents && upcomingEvents.length > 0)) && (
        <section className="relative z-10 max-w-6xl mx-auto px-6 pt-8">
          <div className="grid sm:grid-cols-2 gap-5">
            {activeClubs && activeClubs.length > 0 && (
              <div className="bg-white border border-black/5 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">🏘️ Local Clubs</p>
                  <Link
                    href={user ? "/clubs" : "/login"}
                    className="text-xs text-teal-600 hover:text-teal-500 transition-colors"
                  >
                    {user ? 'See all' : 'Join'}
                  </Link>
                </div>
                <div className="space-y-3">
                  {activeClubs.slice(0, 4).map((club) => (
                    <Link
                      key={club.id}
                      href={user ? `/clubs/${club.id}` : "/login"}
                      className="flex items-center justify-between gap-2 group"
                    >
                      <span className="text-sm text-slate-700 group-hover:text-teal-600 transition-colors truncate">
                        {club.name}
                      </span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{club.member_count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {upcomingEvents && upcomingEvents.length > 0 && (
              <div className="bg-white border border-black/5 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">📅 Upcoming Events</p>
                  <Link
                    href={user ? "/events" : "/login"}
                    className="text-xs text-teal-600 hover:text-teal-500 transition-colors"
                  >
                    {user ? 'See all' : 'Join'}
                  </Link>
                </div>
                <div className="space-y-4">
                  {upcomingEvents.slice(0, 4).map((ev) => {
                    const club = ev.clubs as unknown as { name: string } | null
                    return (
                      <Link
                        key={ev.id}
                        href={user ? `/events/${ev.id}` : "/login"}
                        className="block group"
                      >
                        <h4 className="text-sm font-medium text-slate-700 group-hover:text-teal-600 transition-colors truncate">
                          {ev.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(ev.starts_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          {' · '}
                          {ev.is_online ? 'Online' : (ev.location_name || 'In person')}
                          {club && ` · ${club.name}`}
                        </p>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Hero ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-20">
        <div className="grid lg:grid-cols-2 gap-14 items-center">

          {/* Left: copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              <span className="text-teal-700 text-sm font-medium">Free • Open Source • Privacy-First</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-6">
              Share a book.
              <br />
              <span className="bg-gradient-to-r from-teal-600 via-teal-500 to-amber-500 bg-clip-text text-transparent">
                Change a life.
              </span>
            </h1>

            <p className="text-lg text-slate-600 max-w-xl mb-8 leading-relaxed">
              OLK connects readers across regions. Donate or lend your used books,
              find your next read from someone nearby — all with maximum privacy and zero cost.
            </p>

            {/* Search */}
            <form action="/browse" method="GET" className="flex items-center gap-2 max-w-lg mb-9">
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
                  className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-400 transition-all shadow-sm"
                />
              </div>
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-500 text-white font-semibold px-5 py-3 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap shadow-lg shadow-teal-600/20"
              >
                Search
              </button>
            </form>

            <Link
              href={user ? "/my-books" : "/register"}
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-all shadow-xl shadow-teal-600/20 hover:shadow-teal-600/30 hover:-translate-y-px mb-12"
            >
              Start Sharing Books →
            </Link>

            {/* ── Community Stats ── */}
            {(totalBooks > 0 || totalUsers > 0 || completedExchanges > 0) ? (
              <div className="flex gap-8">
                {[
                  { value: totalBooks ?? 0, label: 'Books Shared', color: 'text-teal-600' },
                  { value: totalUsers ?? 0, label: 'Readers Joined', color: 'text-amber-600' },
                  { value: completedExchanges ?? 0, label: 'Exchanges Made', color: 'text-rose-500' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <AnimatedCounter value={stat.value} className={`text-3xl font-bold ${stat.color}`} />
                    <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Right: decorative bookshelf */}
          <div className="relative">
            <div className="absolute -top-4 -right-3 z-10 bg-white border border-amber-200 shadow-md rounded-full px-3.5 py-1.5 text-xs font-semibold text-amber-700 rotate-3">
              📖 100% Free
            </div>
            <div className="absolute -bottom-4 -left-3 z-10 bg-white border border-teal-200 shadow-md rounded-full px-3.5 py-1.5 text-xs font-semibold text-teal-700 -rotate-2">
              🤝 Community-driven
            </div>

            <div className="relative bg-white border border-black/5 rounded-3xl shadow-xl shadow-amber-900/5 p-8">
              {communityShelfBooks && communityShelfBooks.length > 0 ? (
                <CommunityShelf books={communityShelfBooks} />
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-6 text-center">
                    This week&apos;s shelf
                  </p>
                  <div className="flex items-end justify-center gap-2 h-44">
                    {SHELF_SPINES.map((s, i) => (
                      <div
                        key={i}
                        className={`${s.h} ${s.c} w-7 md:w-8 rounded-t-md shadow-sm relative overflow-hidden`}
                      >
                        <span className="absolute top-3 left-0 right-0 h-px bg-white/30" />
                      </div>
                    ))}
                  </div>
                  <div className="h-3 bg-gradient-to-b from-amber-700 to-amber-800 rounded-sm shadow-md mt-1" />
                  <div className="h-2 mx-2 bg-amber-900/10 rounded-full blur-sm mt-1" />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Main content: books + sticky side panel ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="grid lg:grid-cols-[1fr_320px] gap-10">

          {/* ── Main column ── */}
          <div className="space-y-16 min-w-0">

            {/* Book of the Month */}
            {bookOfMonth && <BookOfMonthCard book={bookOfMonth} />}

            {/* Books from the community */}
            <div>
              <div className="flex items-end justify-between mb-6">
                <div>
                  <p className="text-teal-600 text-sm font-semibold uppercase tracking-widest mb-1">From the Community</p>
                  <h2 className="text-2xl font-bold text-slate-900">Recently Added</h2>
                </div>
                <Link
                  href="/browse"
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors group"
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
                      <div className="aspect-[2/3] rounded-xl overflow-hidden mb-3 border border-black/5 bg-gradient-to-br from-slate-100 to-slate-50 relative shadow-sm">
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
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                            </svg>
                            <span className="text-slate-400 text-xs text-center leading-tight">{book.title}</span>
                          </div>
                        )}
                        {/* Listing type badge */}
                        <div className="absolute top-2 left-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm ${
                            book.listing_type === 'donate'
                              ? 'bg-teal-600 text-white'
                              : 'bg-amber-600 text-white'
                          }`}>
                            {book.listing_type === 'donate' ? 'Free' : 'Lend'}
                          </span>
                        </div>
                        {book.status === 'given' && (
                          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                            <span className="bg-amber-400 text-amber-950 text-xs font-bold px-3 py-1.5 rounded-full">
                              Donated
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <h3 className="font-semibold text-sm leading-snug mb-0.5 text-slate-900 group-hover:text-teal-600 transition-colors line-clamp-2">
                        {book.title}
                      </h3>
                      {book.author && (
                        <p className="text-xs text-slate-500 truncate">by {book.author}</p>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-black/10 rounded-2xl py-16 text-center text-slate-500 bg-white/50">
                  <p>Books will appear here once the community starts sharing.</p>
                  <Link href="/register" className="inline-block mt-4 text-sm text-teal-600 hover:text-teal-500">
                    Be the first to add one →
                  </Link>
                </div>
              )}
            </div>

            {/* Recent Activity Feed */}
            {recentActivity && recentActivity.length > 0 && (
              <div>
                <div className="mb-6">
                  <p className="text-teal-600 text-sm font-semibold uppercase tracking-widest mb-1">Live Activity</p>
                  <h2 className="text-2xl font-bold text-slate-900">Happening right now</h2>
                </div>
                <div className="space-y-3">
                  {recentActivity.map((item: { title: string; listing_type: string; created_at: string; profiles: unknown }, i: number) => {
                    const profile = item.profiles as { display_name: string | null; area_name: string | null } | null
                    const name = profile?.display_name?.split('@')[0] || 'Someone'
                    const area = profile?.area_name
                    const ago = getTimeAgo(item.created_at)
                    return (
                      <div key={i} className="flex items-center gap-4 bg-white border border-black/5 rounded-xl px-5 py-3.5 shadow-sm">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          item.listing_type === 'donate'
                            ? 'bg-teal-50 text-teal-600'
                            : 'bg-amber-50 text-amber-600'
                        }`}>
                          {item.listing_type === 'donate' ? '🎁' : '🤝'}
                        </div>
                        <p className="text-sm text-slate-600 flex-1">
                          <span className="text-slate-900 font-medium">{name}</span>
                          {' '}{item.listing_type === 'donate' ? 'donated' : 'listed'}{' '}
                          <span className="text-teal-600 font-medium">{item.title}</span>
                          {area && <span className="text-slate-400"> in {area}</span>}
                        </p>
                        <span className="text-xs text-slate-400 flex-shrink-0">{ago}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Side panel ── */}
          <aside className="space-y-6 lg:sticky lg:top-24 self-start">

            {/* How it works */}
            <div className="bg-white border border-black/5 rounded-2xl p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-5">How it works</p>
              <div className="space-y-5">
                {STEPS.map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold ${item.color}`}>
                      {item.step}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 leading-snug">{item.title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini CTA card */}
            <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl p-6 text-center shadow-lg shadow-teal-600/20">
              <p className="text-white font-semibold text-sm mb-1">Have books to share?</p>
              <p className="text-teal-50 text-xs mb-4">List one in under a minute.</p>
              <Link
                href={user ? "/my-books" : "/register"}
                className="inline-block bg-white text-teal-700 text-sm font-semibold px-5 py-2 rounded-lg hover:bg-teal-50 transition-colors"
              >
                {user ? 'Add a book' : 'Get started'}
              </Link>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-teal-500 via-teal-500 to-amber-400 p-14 text-center shadow-xl shadow-teal-900/10">
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
              Ready to share your first book?
            </h2>
            <p className="text-teal-50 mb-8 max-w-md mx-auto leading-relaxed">
              Join readers across Kashmir already sharing knowledge, one book at a time.
            </p>
            <Link
              href={user ? "/my-books" : "/register"}
              className="inline-flex items-center gap-2 bg-white hover:bg-teal-50 text-teal-700 font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg hover:-translate-y-px"
            >
              {user ? 'Start Sharing Books →' : 'Get Started — It\'s Free →'}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-black/[0.06] py-10 px-6">
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
            <span className="text-sm text-slate-700 font-medium">Open Library Kashmir</span>
          </div>

          <p className="text-sm text-slate-500">Built with ❤️ for the people of Kashmir</p>

          <div className="flex items-center gap-6 text-sm text-slate-500">
            <Link href="/browse" className="hover:text-slate-900 transition-colors">Browse</Link>
            <Link href="/login" className="hover:text-slate-900 transition-colors">Login</Link>
            <Link href="/register" className="hover:text-slate-900 transition-colors">Register</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
