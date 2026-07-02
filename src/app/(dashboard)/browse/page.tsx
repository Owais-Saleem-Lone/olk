"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createNotification } from '@/lib/notifications'
import { formatDistance } from '@/lib/geo'
import Link from 'next/link'
import ReportModal from '@/components/report-modal'

function sanitizeSearchQuery(input: string): string {
  return input.replace(/[%_\\,().]/g, c => '\\' + c)
}
import BookNotesModal from '@/components/book-notes-modal'

type Profile = {
  id: string
  display_name: string | null
  area_name: string | null
}

type Book = {
  id: string
  title: string
  author: string | null
  condition: string | null
  listing_type: string
  status: string
  genre: string | null
  owner_id: string
  cover_url: string | null
  description: string | null
  publication_year: number | null
  distance_km?: number | null
  owner_name?: string | null
  owner_area?: string | null
  read_count?: number
}

export default function BrowsePage() {
  const supabase = createClient()
  const [books, setBooks] = useState<Book[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterGenre, setFilterGenre] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCondition, setFilterCondition] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [requestedBooks, setRequestedBooks] = useState<Set<string>>(new Set())
  const [bookmarkedBooks, setBookmarkedBooks] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<{ bookId: string; ownerId: string; title: string } | null>(null)
  const [bookProgress, setBookProgress] = useState<Record<string, number>>({})
  const [notesBook, setNotesBook] = useState<{ id: string; title: string } | null>(null)

  const mounted = useRef(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q') || ''
    setSearchQuery(q)
    fetchBooks(q)
  }, [])

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    fetchBooks(searchQuery)
  }, [filterGenre, filterType, filterCondition])

  const fetchBooks = async (query: string = '') => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    let userLat: number | null = null
    let userLng: number | null = null

    if (user) {
      setCurrentUserId(user.id)
      const { data: existingReqs } = await supabase
        .from('book_requests')
        .select('book_id')
        .eq('requester_id', user.id)
        .in('status', ['pending', 'accepted', 'handed_over'])
      if (existingReqs) {
        setRequestedBooks(new Set(existingReqs.map((r: any) => r.book_id)))
      }

      const { data: existingBookmarks } = await supabase
        .from('bookmarks')
        .select('book_id')
        .eq('user_id', user.id)
      if (existingBookmarks) {
        setBookmarkedBooks(new Set(existingBookmarks.map((b: any) => b.book_id)))
      }

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', user.id)
        .single()

      if (myProfile?.latitude && myProfile?.longitude) {
        userLat = myProfile.latitude
        userLng = myProfile.longitude
      }
    }

    if (userLat && userLng) {
      const { data, error } = await supabase.rpc('get_books_nearby', {
        user_lat: userLat,
        user_lng: userLng,
      })

      if (error) {
        console.error('Error fetching nearby books:', error)
      } else if (data) {
        let filtered = data as Book[]
        if (query.trim() !== '') {
          const q = query.toLowerCase()
          filtered = filtered.filter(b =>
            b.title.toLowerCase().includes(q) || (b.author && b.author.toLowerCase().includes(q))
          )
        }
        if (filterGenre) filtered = filtered.filter(b => b.genre === filterGenre)
        if (filterType) filtered = filtered.filter(b => b.listing_type === filterType)
        if (filterCondition) filtered = filtered.filter(b => b.condition === filterCondition)
        setBooks(filtered)
        fetchProgress(filtered)
        const profileMap: Record<string, Profile> = {}
        filtered.forEach((b: any) => {
          if (!profileMap[b.owner_id]) {
            profileMap[b.owner_id] = { id: b.owner_id, display_name: b.owner_name, area_name: b.owner_area }
          }
        })
        setProfiles(profileMap)
      }
    } else {
      let dbQuery = supabase
        .from('books')
        .select('*')
        .in('status', ['available', 'given', 'unavailable'])
        .order('created_at', { ascending: false })

      if (query.trim() !== '') {
        const q = sanitizeSearchQuery(query)
        dbQuery = dbQuery.or(`title.ilike.%${q}%,author.ilike.%${q}%`)
      }
      if (filterGenre) dbQuery = dbQuery.eq('genre', filterGenre)
      if (filterType) dbQuery = dbQuery.eq('listing_type', filterType)
      if (filterCondition) dbQuery = dbQuery.eq('condition', filterCondition)

      const { data, error } = await dbQuery

      if (error) {
        console.error('Error fetching books:', error)
      } else if (data) {
        setBooks(data)
        if (user) {
          await fetchProfiles(data)
          fetchProgress(data)
        }
      }
    }

    setLoading(false)
  }

  const fetchProgress = async (booksData: Book[]) => {
    if (!booksData.length) return
    const bookIds = booksData.map(b => b.id)
    const { data } = await supabase
      .from('book_progress')
      .select('book_id, progress_pct')
      .in('book_id', bookIds)
    if (data) {
      const pm: Record<string, number> = {}
      data.forEach((p: any) => { pm[p.book_id] = p.progress_pct })
      setBookProgress(pm)
    }
  }

  const fetchProfiles = async (booksData: Book[]) => {
    // Get unique owner IDs
    const ownerIds = [...new Set(booksData.map(b => b.owner_id))]
    if (ownerIds.length === 0) return

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ownerIds)

    if (data) {
      const profileMap: Record<string, Profile> = {}
      data.forEach((p) => {
        profileMap[p.id] = p
      })
      setProfiles(profileMap)
    }
  }

  const toggleBookmark = async (bookId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (bookmarkedBooks.has(bookId)) {
      await supabase.from('bookmarks').delete().eq('user_id', user.id).eq('book_id', bookId)
      setBookmarkedBooks(prev => { const s = new Set(prev); s.delete(bookId); return s })
    } else {
      await supabase.from('bookmarks').insert({ user_id: user.id, book_id: bookId })
      setBookmarkedBooks(prev => new Set(prev).add(bookId))
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchBooks(searchQuery)
  }

  const handleRequestBook = async (bookId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('book_requests').insert({
      book_id: bookId,
      requester_id: user.id,
      status: 'pending',
    })

    if (error) {
      if (error.code === '23505') {
        alert('You already have an active request for this book.')
      } else if (error.message.startsWith('RATE_LIMIT_EXCEEDED:')) {
        alert("You've reached your daily request limit. Try again tomorrow.")
      } else {
        console.error('Error requesting book:', error)
        alert('Could not request book: ' + error.message)
      }
    } else {
      setRequestedBooks((prev) => new Set(prev).add(bookId))

      const book = books.find(b => b.id === bookId)
      if (book) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single()

        await createNotification({
          userId: book.owner_id,
          type: 'book_requested',
          title: `${profile?.display_name || 'Someone'} requested your book "${book.title}"`,
          link: '/requests',
        })
      }
    }
  }

  const displayBooks = filterArea
    ? books.filter(b => {
        const area = profiles[b.owner_id]?.area_name
        return area && area.toLowerCase().includes(filterArea.toLowerCase())
      })
    : books

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Browse Books</h1>
      <p className="text-slate-400 mb-8">Find your next read from someone nearby</p>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or author..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 sm:flex-initial bg-teal-500 hover:bg-teal-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Search
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  fetchBooks('')
                }}
                className="flex-1 sm:flex-initial bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-3 rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="mt-4 text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Filters
          {(filterGenre || filterType || filterCondition || filterArea) && (
            <span className="bg-teal-500/20 text-teal-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
              {[filterGenre, filterType, filterCondition, filterArea].filter(Boolean).length}
            </span>
          )}
        </button>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <select
              value={filterGenre}
              onChange={(e) => setFilterGenre(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="" className="bg-slate-900">All Genres</option>
              <optgroup label="Natural Sciences" className="bg-slate-900">
                <option value="Physics" className="bg-slate-900">Physics</option>
                <option value="Chemistry" className="bg-slate-900">Chemistry</option>
                <option value="Biology" className="bg-slate-900">Biology</option>
                <option value="Mathematics" className="bg-slate-900">Mathematics</option>
              </optgroup>
              <optgroup label="Engineering" className="bg-slate-900">
                <option value="Civil Engineering" className="bg-slate-900">Civil Engineering</option>
                <option value="Mechanical Engineering" className="bg-slate-900">Mechanical Engineering</option>
                <option value="Electrical Engineering" className="bg-slate-900">Electrical Engineering</option>
                <option value="IT/Computer Science" className="bg-slate-900">IT/Computer Science</option>
              </optgroup>
              <optgroup label="Medicine" className="bg-slate-900">
                <option value="Anatomy" className="bg-slate-900">Anatomy</option>
                <option value="Physiology" className="bg-slate-900">Physiology</option>
                <option value="Clinical Medicine" className="bg-slate-900">Clinical Medicine</option>
              </optgroup>
              <optgroup label="Social Sciences" className="bg-slate-900">
                <option value="History" className="bg-slate-900">History</option>
                <option value="Civics" className="bg-slate-900">Civics</option>
                <option value="Geography" className="bg-slate-900">Geography</option>
                <option value="Psychology" className="bg-slate-900">Psychology</option>
                <option value="Philosophy" className="bg-slate-900">Philosophy</option>
              </optgroup>
              <optgroup label="Literature" className="bg-slate-900">
                <option value="English Literature" className="bg-slate-900">English Literature</option>
                <option value="Urdu Literature" className="bg-slate-900">Urdu Literature</option>
                <option value="Hindi Literature" className="bg-slate-900">Hindi Literature</option>
                <option value="Persian Literature" className="bg-slate-900">Persian Literature</option>
                <option value="Arabic Literature" className="bg-slate-900">Arabic Literature</option>
                <option value="Kashmiri Literature" className="bg-slate-900">Kashmiri Literature</option>
              </optgroup>
              <optgroup label="Other" className="bg-slate-900">
                <option value="General" className="bg-slate-900">General / Other</option>
              </optgroup>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="" className="bg-slate-900">All Types</option>
              <option value="donate" className="bg-slate-900">Donate</option>
              <option value="lend" className="bg-slate-900">Lend</option>
            </select>

            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="" className="bg-slate-900">Any Condition</option>
              <option value="excellent" className="bg-slate-900">Excellent</option>
              <option value="good" className="bg-slate-900">Good</option>
              <option value="fair" className="bg-slate-900">Fair</option>
              <option value="poor" className="bg-slate-900">Poor</option>
            </select>

            <input
              type="text"
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              placeholder="Filter by area..."
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        )}
      </form>

      {/* Loading State */}
      {loading && (
        <p className="text-slate-400 text-center py-20">Loading books...</p>
      )}

      {/* Empty State */}
      {!loading && displayBooks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-6xl mb-4">📖</div>
          <h2 className="text-xl font-semibold mb-2">No books found</h2>
          <p className="text-slate-400 max-w-md">
            {(searchQuery || filterGenre || filterType || filterCondition || filterArea)
              ? 'No books match your filters. Try adjusting your search!'
              : 'Be the first to add a book to the community!'}
          </p>
        </div>
      )}

      {/* Books Grid */}
      {!loading && displayBooks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayBooks.map((book) => {
            const owner = profiles[book.owner_id]
            const isOwnBook = book.owner_id === currentUserId
            const isRequested = requestedBooks.has(book.id)

            return (
              <div
                key={book.id}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-teal-500/30 transition-colors flex flex-col"
              >
                {/* Cover image */}
                <div className="relative w-full aspect-[2/3] bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                      </svg>
                    </div>
                  )}
                  {/* Listing type badge over image */}
                  <div className="absolute top-2 left-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
                      book.listing_type === 'donate'
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {book.listing_type === 'donate' ? '🎁 Donate' : '🤝 Lend'}
                    </span>
                  </div>
                  {book.condition && (
                    <div className="absolute top-2 right-2">
                      <span className="text-xs text-slate-300 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full capitalize">
                        {book.condition}
                      </span>
                    </div>
                  )}
                  {book.status === 'given' && (
                    <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2.5 px-4">
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm">
                        Donated
                      </span>
                      {bookProgress[book.id] != null && (
                        <div className="w-4/5">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">📖 Being read</span>
                            <span className="text-teal-400 font-semibold">{bookProgress[book.id]}%</span>
                          </div>
                          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-400 rounded-full transition-all" style={{ width: `${bookProgress[book.id]}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {book.status === 'unavailable' && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2.5 px-4">
                      <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm">
                        Being Read
                      </span>
                      {bookProgress[book.id] != null ? (
                        <div className="w-4/5">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">Progress</span>
                            <span className="text-blue-300 font-semibold">{bookProgress[book.id]}%</span>
                          </div>
                          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${bookProgress[book.id]}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-blue-400/60 text-xs">No progress yet</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-4 flex flex-col flex-1">
                <h3 className="text-sm font-semibold mb-0.5 text-white leading-snug">{book.title}</h3>
                {book.author && <p className="text-slate-400 text-xs mb-2">by {book.author}</p>}

                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {book.genre && (
                    <span className="inline-block bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-medium px-2.5 py-1 rounded-full">
                      {book.genre}
                    </span>
                  )}
                  {book.publication_year && (
                    <span className="text-xs text-slate-500">{book.publication_year}</span>
                  )}
                </div>
                {book.description && (
                  <p className="text-xs text-slate-500 mb-2 line-clamp-2">{book.description}</p>
                )}
                {(book.read_count ?? 0) > 0 && (
                  <p className="text-xs text-slate-500 mb-3">📖 Read {book.read_count}×</p>
                )}

                {/* Owner info — only shown to logged-in users */}
                {currentUserId && owner && (
                  <div className="mt-auto pt-4 border-t border-white/5 mb-4">
                    <Link href={`/user/${book.owner_id}`} className="text-sm text-slate-300 hover:text-teal-400 transition-colors">
                      👤 {owner.display_name || 'Anonymous'}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {book.distance_km != null && (
                        <span className="text-teal-400 font-medium">{formatDistance(book.distance_km)}</span>
                      )}
                      {book.distance_km != null && owner.area_name && ' · '}
                      {owner.area_name && <span>📍 {owner.area_name}</span>}
                    </p>
                  </div>
                )}

                {/* Request Button */}
                {book.status === 'given' ? (
                  <button
                    disabled
                    className="w-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium py-2 rounded-lg text-sm cursor-not-allowed"
                  >
                    Donated
                  </button>
                ) : book.status === 'unavailable' ? (
                  <button
                    disabled
                    className="w-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium py-2 rounded-lg text-sm cursor-not-allowed"
                  >
                    Currently Being Read
                  </button>
                ) : !currentUserId ? (
                  <Link
                    href="/login"
                    className="w-full block text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2 rounded-lg text-sm transition-colors"
                  >
                    Login to Request
                  </Link>
                ) : isOwnBook ? (
                  <button
                    disabled
                    className="w-full bg-white/5 text-slate-500 font-medium py-2 rounded-lg text-sm cursor-not-allowed"
                  >
                    This is your book
                  </button>
                ) : isRequested ? (
                  <button
                    disabled
                    className="w-full bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium py-2 rounded-lg text-sm cursor-not-allowed"
                  >
                    Requested ✓
                  </button>
                ) : (
                  <button
                    onClick={() => handleRequestBook(book.id)}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2 rounded-lg text-sm transition-colors"
                  >
                    Request Book
                  </button>
                )}
                {currentUserId && (
                  <div className="flex gap-2 mt-2">
                    {!isOwnBook && book.status === 'available' && (
                      <button
                        onClick={() => toggleBookmark(book.id)}
                        className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
                          bookmarkedBooks.has(book.id)
                            ? 'text-teal-400 bg-teal-500/10 border border-teal-500/20'
                            : 'text-slate-500 hover:text-teal-400 hover:bg-white/5'
                        }`}
                      >
                        {bookmarkedBooks.has(book.id) ? '🔖 Saved' : '🔖 Save'}
                      </button>
                    )}
                    <button
                      onClick={() => setNotesBook({ id: book.id, title: book.title })}
                      className="flex-1 text-xs py-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-white/5 transition-colors"
                    >
                      💬 Notes
                    </button>
                    {!isOwnBook && (
                      <button
                        onClick={() => setReportTarget({ bookId: book.id, ownerId: book.owner_id, title: book.title })}
                        className="text-xs text-slate-600 hover:text-red-400 transition-colors px-2 py-1.5"
                      >
                        Report
                      </button>
                    )}
                  </div>
                )}
                </div>{/* end p-5 */}
              </div>
            )
          })}
        </div>
      )}

      {reportTarget && (
        <ReportModal
          reportedBookId={reportTarget.bookId}
          reportedUserId={reportTarget.ownerId}
          bookTitle={reportTarget.title}
          onClose={() => setReportTarget(null)}
        />
      )}

      {notesBook && currentUserId && (
        <BookNotesModal
          bookId={notesBook.id}
          bookTitle={notesBook.title}
          currentUserId={currentUserId}
          onClose={() => setNotesBook(null)}
        />
      )}
    </div>
  )
}