"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Profile = {
  display_name: string | null
  area_name: string | null
  bio: string | null
  created_at: string
}

type Book = {
  id: string
  title: string
  author: string | null
  condition: string | null
  listing_type: string
  status: string
  genre: string | null
  cover_url: string | null
}

type Stats = {
  totalBooks: number
  availableBooks: number
  completedExchanges: number
}

export default function UserProfilePage() {
  const supabase = createClient()
  const params = useParams()
  const userId = params.id as string

  const [profile, setProfile] = useState<Profile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [stats, setStats] = useState<Stats>({ totalBooks: 0, availableBooks: 0, completedExchanges: 0 })
  const [rating, setRating] = useState<{ avg: number; count: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetchUserProfile()
  }, [userId])

  const fetchUserProfile = async () => {
    setLoading(true)

    const { data: profileData } = await supabase
      .from('profiles')
      .select('display_name, area_name, bio, created_at')
      .eq('id', userId)
      .single()

    if (!profileData) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setProfile(profileData)

    const { data: booksData } = await supabase
      .from('books')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })

    if (booksData) {
      setBooks(booksData)
      setStats({
        totalBooks: booksData.length,
        availableBooks: booksData.filter(b => b.status === 'available').length,
        completedExchanges: booksData.filter(b => b.status === 'given').length,
      })
    }

    const { data: ratingsData } = await supabase
      .from('ratings')
      .select('score')
      .eq('rated_user_id', userId)

    if (ratingsData && ratingsData.length > 0) {
      const avg = ratingsData.reduce((sum, r) => sum + r.score, 0) / ratingsData.length
      setRating({ avg: Math.round(avg * 10) / 10, count: ratingsData.length })
    }

    setLoading(false)
  }

  if (loading) {
    return <p className="text-slate-400 text-center py-20">Loading profile...</p>
  }

  if (notFound) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">👤</div>
        <h2 className="text-xl font-semibold mb-2">User not found</h2>
        <p className="text-slate-400 mb-6">This profile doesn't exist or has been removed.</p>
        <Link href="/browse" className="text-teal-400 hover:text-teal-300 text-sm">
          ← Back to Browse
        </Link>
      </div>
    )
  }

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null

  const availableBooks = books.filter(b => b.status === 'available')

  return (
    <div>
      {/* Profile Header */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 mb-8">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-2xl flex-shrink-0">
            {(profile?.display_name || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-1">{profile?.display_name || 'Anonymous'}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
              {profile?.area_name && (
                <span className="flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  {profile.area_name}
                </span>
              )}
              {joinDate && (
                <span className="flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                  Joined {joinDate}
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-1 text-amber-400">
                  ★ {rating.avg} <span className="text-slate-500">({rating.count} {rating.count === 1 ? 'rating' : 'ratings'})</span>
                </span>
              )}
            </div>
            {stats.completedExchanges >= 3 && (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                  ✓ Trusted Sharer
                </span>
              </div>
            )}
            {profile?.bio && (
              <p className="text-sm text-slate-300 mt-3 leading-relaxed">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/[0.06]">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{stats.totalBooks}</p>
            <p className="text-xs text-slate-500 mt-1">Books Listed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-teal-400">{stats.availableBooks}</p>
            <p className="text-xs text-slate-500 mt-1">Available Now</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-cyan-400">{stats.completedExchanges}</p>
            <p className="text-xs text-slate-500 mt-1">Books Shared</p>
          </div>
        </div>
      </div>

      {/* Available Books */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Available Books</h2>

        {availableBooks.length === 0 ? (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 text-center text-slate-500">
            No books available right now.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {availableBooks.map((book) => (
              <Link
                key={book.id}
                href={`/browse?q=${encodeURIComponent(book.title)}`}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-teal-500/30 transition-colors group"
              >
                <div className="relative w-full aspect-[2/3] bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                      <span className="text-slate-600 text-xs text-center leading-tight">{book.title}</span>
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
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold leading-snug mb-0.5 group-hover:text-teal-400 transition-colors line-clamp-2">{book.title}</h3>
                  {book.author && <p className="text-xs text-slate-500 truncate">by {book.author}</p>}
                  {book.genre && (
                    <span className="inline-block bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-medium px-2 py-0.5 rounded-full mt-2">{book.genre}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link href="/browse" className="text-sm text-slate-400 hover:text-teal-400 transition-colors">
        ← Back to Browse
      </Link>
    </div>
  )
}
