"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

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
}

export default function BrowsePage() {
  const supabase = createClient()
  const [books, setBooks] = useState<Book[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [requestedBooks, setRequestedBooks] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q') || ''
    setSearchQuery(q)
    fetchBooks(q)
  }, [])

  const fetchBooks = async (query: string = '') => {
    setLoading(true)

    // Get current user so we don't show "Request" on our own books
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)

    let dbQuery = supabase
      .from('books')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false })

    if (query.trim() !== '') {
      dbQuery = dbQuery.or(`title.ilike.%${query}%,author.ilike.%${query}%`)
    }

    const { data, error } = await dbQuery

    if (error) {
      console.error('Error fetching books:', error)
    } else if (data) {
      setBooks(data)
      if (user) await fetchProfiles(data)
    }
    setLoading(false)
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
      console.error('Error requesting book:', error)
      alert('Could not request book: ' + error.message)
    } else {
      setRequestedBooks((prev) => new Set(prev).add(bookId))
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Browse Books</h1>
      <p className="text-slate-400 mb-8">Find your next read from someone nearby</p>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
        <div className="flex gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or author..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="submit"
            className="bg-teal-500 hover:bg-teal-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
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
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-3 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Loading State */}
      {loading && (
        <p className="text-slate-400 text-center py-20">Loading books...</p>
      )}

      {/* Empty State */}
      {!loading && books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-6xl mb-4">📖</div>
          <h2 className="text-xl font-semibold mb-2">No books found</h2>
          <p className="text-slate-400 max-w-md">
            {searchQuery ? `No books match "${searchQuery}". Try another search!` : "Be the first to add a book to the community!"}
          </p>
        </div>
      )}

      {/* Books Grid */}
      {!loading && books.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {books.map((book) => {
            const owner = profiles[book.owner_id]
            const isOwnBook = book.owner_id === currentUserId
            const isRequested = requestedBooks.has(book.id)

            return (
              <div
                key={book.id}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-teal-500/30 transition-colors flex flex-col"
              >
                {/* Cover image */}
                <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
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
                </div>

                <div className="p-4 flex flex-col flex-1">
                <h3 className="text-sm font-semibold mb-0.5 text-white leading-snug">{book.title}</h3>
                {book.author && <p className="text-slate-400 text-xs mb-2">by {book.author}</p>}

                {book.genre && (
                  <span className="inline-block bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-medium px-2.5 py-1 rounded-full mb-4">
                    {book.genre}
                  </span>
                )}

                {/* Owner info — only shown to logged-in users */}
                {currentUserId && owner && (
                  <div className="mt-auto pt-4 border-t border-white/5 mb-4">
                    <p className="text-sm text-slate-300">
                      👤 {owner.display_name || 'Anonymous'}
                    </p>
                    {owner.area_name && (
                      <p className="text-xs text-slate-500">📍 {owner.area_name}</p>
                    )}
                  </div>
                )}

                {/* Request Button */}
                {!currentUserId ? (
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
                </div>{/* end p-5 */}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}