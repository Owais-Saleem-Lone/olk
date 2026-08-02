"use client"

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { toast } from '@/hooks/use-toast'
import { createNotification } from '@/lib/notifications'
import { formatDistance, haversineKm } from '@/lib/geo'
import { STATUS_PILL, STATUS_LABEL } from '@/components/request-card'
import ReportModal from '@/components/report-modal'
import BookNotesModal from '@/components/book-notes-modal'

type BookDetail = {
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
  lending_duration_months: number | null
  read_count: number
}

type OwnerProfile = {
  display_name: string | null
  area_name: string | null
  bio: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
}

type NotePreview = { id: string; note: string; profiles: { display_name: string | null } | null }

export default function BookDetailPage() {
  const supabase = createClient()
  const params = useParams()
  const bookId = params.id as string

  const [book, setBook] = useState<BookDetail | null>(null)
  const [owner, setOwner] = useState<OwnerProfile | null>(null)
  const [ownerStats, setOwnerStats] = useState({ totalBooks: 0, availableBooks: 0, completedExchanges: 0 })
  const [rating, setRating] = useState<{ avg: number; count: number } | null>(null)
  const [notesPreview, setNotesPreview] = useState<{ count: number; notes: NotePreview[] }>({ count: 0, notes: [] })
  const [progress, setProgress] = useState<number | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [myRequestStatus, setMyRequestStatus] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  const fetchDetail = useCallback(async () => {
    setLoading(true)

    const { data: bookData } = await supabase.from('books').select('*').eq('id', bookId).single()
    if (!bookData) { setNotFound(true); setLoading(false); return }
    setBook(bookData)

    const { data: ownerData } = await supabase
      .from('profiles')
      .select('display_name, area_name, bio, latitude, longitude, created_at')
      .eq('id', bookData.owner_id)
      .single()
    setOwner(ownerData)

    const { data: ownerBooks } = await supabase.from('books').select('status').eq('owner_id', bookData.owner_id)
    if (ownerBooks) {
      setOwnerStats({
        totalBooks: ownerBooks.length,
        availableBooks: ownerBooks.filter(b => b.status === 'available').length,
        completedExchanges: ownerBooks.filter(b => b.status === 'given').length,
      })
    }

    const { data: ratingsData } = await supabase.from('ratings').select('score').eq('rated_user_id', bookData.owner_id)
    setRating(
      ratingsData && ratingsData.length > 0
        ? { avg: Math.round((ratingsData.reduce((s, r) => s + r.score, 0) / ratingsData.length) * 10) / 10, count: ratingsData.length }
        : null
    )

    const { data: notesData, count } = await supabase
      .from('book_notes')
      .select('id, note, profiles!book_notes_user_id_fkey(display_name)', { count: 'exact' })
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(2)
    setNotesPreview({ count: count ?? 0, notes: (notesData as unknown as NotePreview[]) ?? [] })

    const { data: progressRows } = await supabase.from('book_progress').select('progress_pct').eq('book_id', bookId).limit(1)
    setProgress(progressRows?.[0]?.progress_pct ?? null)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)

      const { data: myProfile } = await supabase.from('profiles').select('latitude, longitude').eq('id', user.id).single()
      if (myProfile?.latitude && myProfile?.longitude && ownerData?.latitude && ownerData?.longitude) {
        setDistanceKm(haversineKm(myProfile.latitude, myProfile.longitude, ownerData.latitude, ownerData.longitude))
      }

      const { data: activeReq } = await supabase
        .from('book_requests')
        .select('status')
        .eq('book_id', bookId)
        .eq('requester_id', user.id)
        .in('status', ['pending', 'accepted', 'handed_over'])
        .maybeSingle()
      setMyRequestStatus(activeReq?.status ?? null)

      const { data: bm } = await supabase.from('bookmarks').select('id').eq('user_id', user.id).eq('book_id', bookId).maybeSingle()
      setIsBookmarked(!!bm)
    }

    setLoading(false)
  }, [supabase, bookId])

  useAsyncEffect(() => fetchDetail(), [fetchDetail])

  const handleRequest = async () => {
    if (!currentUserId || !book || requesting) return
    setRequesting(true)

    const { data: newRequest, error } = await supabase.from('book_requests').insert({
      book_id: book.id,
      requester_id: currentUserId,
      status: 'pending',
    }).select('id').single()

    if (error) {
      if (error.code === '23505') {
        toast.error('You already have an active request for this book.')
      } else if (error.message.startsWith('RATE_LIMIT_EXCEEDED:')) {
        toast.error("You've reached your daily request limit. Try again tomorrow.")
      } else {
        toast.error('Could not request book: ' + error.message)
      }
    } else {
      setMyRequestStatus('pending')
      const { data: myProfile } = await supabase.from('profiles').select('display_name').eq('id', currentUserId).single()
      await createNotification({
        userId: book.owner_id,
        type: 'book_requested',
        title: `${myProfile?.display_name || 'Someone'} requested your book "${book.title}"`,
        link: '/requests',
        context: { kind: 'request', id: newRequest.id },
      })
    }
    setRequesting(false)
  }

  const toggleBookmark = async () => {
    if (!currentUserId || !book) return
    if (isBookmarked) {
      await supabase.from('bookmarks').delete().eq('user_id', currentUserId).eq('book_id', book.id)
      setIsBookmarked(false)
    } else {
      await supabase.from('bookmarks').insert({ user_id: currentUserId, book_id: book.id })
      setIsBookmarked(true)
    }
  }

  if (loading) return <p className="text-slate-600 text-center py-20">Loading book...</p>

  if (notFound || !book) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📖</div>
        <h2 className="text-xl font-semibold mb-2">Book not found</h2>
        <Link href="/browse" className="text-brand-teal-dark hover:text-teal-700 text-sm">← Back to Browse</Link>
      </div>
    )
  }

  const isOwnBook = book.owner_id === currentUserId
  const joinDate = owner?.created_at
    ? new Date(owner.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-teal-dark transition-colors mb-6">
        ← Back to Browse
      </Link>

      {/* ── Hero ── */}
      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden shadow-sm mb-8">
        <div className="grid md:grid-cols-[300px_1fr]">
          {/* Cover */}
          <div className="relative w-full aspect-[2/3] md:aspect-auto bg-gradient-to-br from-teal-50 to-slate-100 overflow-hidden">
            {book.cover_url ? (
              <Image
                src={book.cover_url}
                alt={book.title}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 300px"
                className="object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </div>
            )}
            <div className="absolute top-3 left-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${
                book.listing_type === 'donate' ? 'bg-brand-teal-dark text-white' : 'bg-blue-600 text-white'
              }`}>
                {book.listing_type === 'donate' ? '🎁 Donate' : '🤝 Lend'}
              </span>
            </div>
            {book.condition && (
              <div className="absolute top-3 right-3">
                <span className="text-xs text-white bg-slate-800 shadow-sm px-2 py-1 rounded-full capitalize">
                  {book.condition}
                </span>
              </div>
            )}
            {book.status === 'given' && (
              <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2.5 px-4">
                <span className="bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">Donated</span>
                {progress != null && (
                  <div className="w-4/5">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">📖 Being read</span>
                      <span className="text-brand-teal-dark font-semibold">{progress}%</span>
                    </div>
                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-teal-light rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {book.status === 'unavailable' && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2.5 px-4">
                <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">Being Read</span>
                {progress != null && (
                  <div className="w-4/5">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">Progress</span>
                      <span className="text-blue-700 font-semibold">{progress}%</span>
                    </div>
                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-6 md:p-8 flex flex-col">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {book.genre && (
                <span className="inline-block bg-purple-500/10 text-purple-600 border border-purple-500/20 text-xs font-medium px-2.5 py-1 rounded-full">
                  {book.genre}
                </span>
              )}
              {book.publication_year && <span className="text-xs text-slate-500">{book.publication_year}</span>}
              {book.read_count > 0 && <span className="text-xs text-slate-500">📖 Read {book.read_count}×</span>}
            </div>

            <h1 className="text-3xl font-bold text-slate-900 mb-1 leading-tight tracking-tight">{book.title}</h1>
            {book.author && <p className="text-lg text-slate-600 italic mb-4">by {book.author}</p>}

            {(distanceKm != null || owner?.area_name) && (
              <p className="text-sm text-slate-500 mb-5">
                {distanceKm != null && <span className="text-brand-teal-dark font-medium">{formatDistance(distanceKm)}</span>}
                {distanceKm != null && owner?.area_name && ' · '}
                {owner?.area_name && <span>📍 {owner.area_name}</span>}
              </p>
            )}

            {book.description && (
              <div className="border-l-2 border-teal-200 pl-4 mb-6">
                <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-wrap">{book.description}</p>
              </div>
            )}

            {book.listing_type === 'lend' && book.lending_duration_months && (
              <p className="text-xs text-slate-500 mb-6">
                🕒 Lend period: up to {book.lending_duration_months} month{book.lending_duration_months > 1 ? 's' : ''}
              </p>
            )}

            {/* Actions */}
            <div className="mt-auto pt-2 flex flex-wrap items-center gap-3">
              {book.status === 'given' ? (
                <span className="px-5 py-2 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  Donated
                </span>
              ) : book.status === 'unavailable' ? (
                <span className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  Currently Being Read
                </span>
              ) : !currentUserId ? (
                <Link href="/login" className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 font-medium px-5 py-2 rounded-lg text-sm transition-colors">
                  Login to Request
                </Link>
              ) : isOwnBook ? (
                <span className="px-5 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-500">
                  This is your book
                </span>
              ) : myRequestStatus ? (
                <span className={`px-5 py-2 rounded-lg text-sm font-semibold border ${STATUS_PILL[myRequestStatus] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  ✓ {STATUS_LABEL[myRequestStatus] || myRequestStatus}
                </span>
              ) : (
                <button
                  onClick={handleRequest}
                  disabled={requesting}
                  className="bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {requesting ? 'Requesting...' : 'Request Book'}
                </button>
              )}

              {currentUserId && !isOwnBook && book.status === 'available' && (
                <button
                  onClick={toggleBookmark}
                  className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
                    isBookmarked
                      ? 'text-brand-teal-dark bg-brand-teal/10 border-brand-teal/20'
                      : 'text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isBookmarked ? '🔖 Saved' : '🔖 Save'}
                </button>
              )}

              {currentUserId && (
                <button
                  onClick={() => setNotesOpen(true)}
                  className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  💬 Notes {notesPreview.count > 0 && `(${notesPreview.count})`}
                </button>
              )}

              {currentUserId && !isOwnBook && (
                <button onClick={() => setReportOpen(true)} className="text-sm text-slate-400 hover:text-red-600 transition-colors ml-auto">
                  Report
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Owner ── */}
      {owner && (
        <div className="bg-white border border-black/5 rounded-2xl p-6 mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">About the Owner</p>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-brand-teal-dark font-bold text-xl flex-shrink-0">
              {(owner.display_name || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <Link href={`/user/${book.owner_id}`} className="font-semibold text-slate-900 hover:text-brand-teal-dark transition-colors">
                {owner.display_name || 'Anonymous'}
              </Link>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 mt-1">
                {owner.area_name && <span>📍 {owner.area_name}</span>}
                {joinDate && <span>Joined {joinDate}</span>}
                {rating && (
                  <span className="text-amber-600">★ {rating.avg} <span className="text-slate-500">({rating.count})</span></span>
                )}
              </div>
              {ownerStats.completedExchanges >= 3 && (
                <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-semibold px-2.5 py-1 rounded-full mt-2">
                  ✓ Trusted Sharer
                </span>
              )}
              {owner.bio && <p className="text-sm text-slate-700 mt-3 leading-relaxed">{owner.bio}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-black/5">
            <div className="text-center">
              <p className="text-xl font-bold text-slate-900">{ownerStats.totalBooks}</p>
              <p className="text-xs text-slate-500 mt-1">Books Listed</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-brand-teal-dark">{ownerStats.availableBooks}</p>
              <p className="text-xs text-slate-500 mt-1">Available Now</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-cyan-400">{ownerStats.completedExchanges}</p>
              <p className="text-xs text-slate-500 mt-1">Books Shared</p>
            </div>
          </div>

          <Link href={`/user/${book.owner_id}`} className="inline-block mt-5 text-sm text-brand-teal-dark hover:text-teal-700 transition-colors">
            View full profile →
          </Link>
        </div>
      )}

      {/* ── Community notes preview ── */}
      {notesPreview.notes.length > 0 && (
        <div className="bg-white border border-black/5 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">💬 Community Notes</p>
            <button onClick={() => setNotesOpen(true)} className="text-xs text-teal-600 hover:text-teal-500 transition-colors">
              View all
            </button>
          </div>
          <div className="space-y-3">
            {notesPreview.notes.map(n => (
              <p key={n.id} className="text-sm text-slate-700 leading-relaxed border-l-2 border-slate-100 pl-3">
                &ldquo;{n.note}&rdquo; <span className="text-xs text-slate-400">— {n.profiles?.display_name || 'Reader'}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {reportOpen && (
        <ReportModal
          reportedBookId={book.id}
          reportedUserId={book.owner_id}
          bookTitle={book.title}
          onClose={() => setReportOpen(false)}
        />
      )}

      {notesOpen && currentUserId && (
        <BookNotesModal
          bookId={book.id}
          bookTitle={book.title}
          currentUserId={currentUserId}
          onClose={() => { setNotesOpen(false); fetchDetail() }}
        />
      )}
    </div>
  )
}
