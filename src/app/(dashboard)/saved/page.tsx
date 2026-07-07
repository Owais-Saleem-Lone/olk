"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'

type SavedBook = {
  id: string
  book_id: string
  books: {
    id: string
    title: string
    author: string | null
    condition: string | null
    listing_type: string
    status: string
    genre: string | null
    cover_url: string | null
    owner_id: string
  }
}

export default function SavedBooksPage() {
  const supabase = createClient()
  const [savedBooks, setSavedBooks] = useState<SavedBook[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSaved = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookmarks')
      .select('id, book_id, books(id, title, author, condition, listing_type, status, genre, cover_url, owner_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (data) setSavedBooks(data as unknown as SavedBook[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { queueMicrotask(() => fetchSaved()) }, [fetchSaved])

  const handleRemove = async (bookmarkId: string) => {
    await supabase.from('bookmarks').delete().eq('id', bookmarkId)
    setSavedBooks(prev => prev.filter(b => b.id !== bookmarkId))
  }

  if (loading) return <p className="text-slate-400">Loading saved books...</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Saved Books</h1>
      <p className="text-slate-400 mb-8">Books you&apos;ve bookmarked for later</p>

      {savedBooks.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🔖</div>
          <p className="text-slate-500 mb-4">No saved books yet</p>
          <Link href="/browse" className="text-sm text-teal-400 hover:text-teal-300">
            Browse books to save some →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {savedBooks.map((item) => {
            const book = item.books
            if (!book) return null
            return (
              <div key={item.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden flex flex-col">
                <Link href={`/browse?q=${encodeURIComponent(book.title)}`}>
                  <div className="relative w-full aspect-[2/3] bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
                    {book.cover_url ? (
                      <Image src={book.cover_url} alt={book.title} fill unoptimized sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                        <span className="text-slate-600 text-xs text-center">{book.title}</span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
                        book.listing_type === 'donate'
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}>
                        {book.listing_type === 'donate' ? 'Free' : 'Lend'}
                      </span>
                    </div>
                    {book.status === 'given' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm">Donated</span>
                      </div>
                    )}
                  </div>
                </Link>
                <div className="p-3 flex flex-col flex-1">
                  <h3 className="text-sm font-semibold leading-snug mb-0.5">{book.title}</h3>
                  {book.author && <p className="text-xs text-slate-500 truncate mb-2">by {book.author}</p>}
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="mt-auto w-full text-xs text-slate-500 hover:text-red-400 bg-white/5 hover:bg-red-500/10 border border-white/10 py-2 rounded-lg transition-colors"
                  >
                    Remove from saved
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
