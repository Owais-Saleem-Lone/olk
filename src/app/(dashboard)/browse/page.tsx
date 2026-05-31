"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Book = {
  id: string
  title: string
  author: string | null
  condition: string | null
  listing_type: string
  status: string
}

export default function BrowsePage() {
  const supabase = createClient()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBooks()
  }, [])

  const fetchBooks = async () => {
    setLoading(true)
    // Ask the database for all available books
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching books:', error)
    } else if (data) {
      setBooks(data)
    }
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Browse Books</h1>
      <p className="text-slate-400 mb-8">Find your next read from someone nearby</p>

      {/* Search Bar */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
        <input
          type="text"
          placeholder="Search by title, author, or ISBN... (coming soon!)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <p className="text-slate-400 text-center py-20">Loading books...</p>
      )}

      {/* Empty State */}
      {!loading && books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-6xl mb-4">📖</div>
          <h2 className="text-xl font-semibold mb-2">No books just yet</h2>
          <p className="text-slate-400 max-w-md">
            Be the first to add a book to the community! Once books are added, they will appear right here.
          </p>
        </div>
      )}

      {/* Books Grid */}
      {!loading && books.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {books.map((book) => (
            <div 
              key={book.id} 
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-teal-500/30 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  book.listing_type === 'donate' 
                    ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' 
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}>
                  {book.listing_type === 'donate' ? '🎁 Donate' : '🤝 Lend'}
                </span>
                {book.condition && (
                  <span className="text-xs text-slate-500 capitalize">{book.condition}</span>
                )}
              </div>
              
              <h3 className="text-lg font-semibold mb-1 text-white">{book.title}</h3>
              {book.author && <p className="text-slate-400 text-sm mb-4">by {book.author}</p>}
              
              <button className="w-full mt-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                Request Book
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}