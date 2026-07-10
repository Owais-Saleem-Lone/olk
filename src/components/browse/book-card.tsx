"use client"

import Link from 'next/link'
import Image from 'next/image'
import { formatDistance } from '@/lib/geo'
import type { Book, Profile } from './types'

export default function BookCard({
  book,
  owner,
  currentUserId,
  isRequested,
  isBookmarked,
  progress,
  onRequest,
  onToggleBookmark,
  onOpenNotes,
  onReport,
}: {
  book: Book
  owner: Profile | undefined
  currentUserId: string | null
  isRequested: boolean
  isBookmarked: boolean
  progress: number | undefined
  onRequest: () => void
  onToggleBookmark: () => void
  onOpenNotes: () => void
  onReport: () => void
}) {
  const isOwnBook = book.owner_id === currentUserId

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-brand-teal/30 transition-colors flex flex-col">
      {/* Cover image */}
      <div className="relative w-full aspect-[2/3] bg-gradient-to-br from-brand-slate-light to-brand-slate overflow-hidden">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={book.title}
            fill
            unoptimized
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-slate-muted">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
        )}
        {/* Listing type badge over image */}
        <div className="absolute top-2 left-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
            book.listing_type === 'donate'
              ? 'bg-brand-teal/20 text-teal-300 border border-brand-teal/30'
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
            {progress != null && (
              <div className="w-4/5">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">📖 Being read</span>
                  <span className="text-brand-teal-light font-semibold">{progress}%</span>
                </div>
                <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-teal-light rounded-full transition-all" style={{ width: `${progress}%` }} />
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
            {progress != null ? (
              <div className="w-4/5">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Progress</span>
                  <span className="text-blue-300 font-semibold">{progress}%</span>
                </div>
                <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
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
            <Link href={`/user/${book.owner_id}`} className="text-sm text-slate-300 hover:text-brand-teal-light transition-colors">
              👤 {owner.display_name || 'Anonymous'}
            </Link>
            <p className="text-xs text-slate-500 mt-0.5">
              {book.distance_km != null && (
                <span className="text-brand-teal-light font-medium">{formatDistance(book.distance_km)}</span>
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
            className="w-full bg-brand-teal/10 text-brand-teal-light border border-brand-teal/20 font-medium py-2 rounded-lg text-sm cursor-not-allowed"
          >
            Requested ✓
          </button>
        ) : (
          <button
            onClick={onRequest}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            Request Book
          </button>
        )}
        {currentUserId && (
          <div className="flex gap-2 mt-2">
            {!isOwnBook && book.status === 'available' && (
              <button
                onClick={onToggleBookmark}
                className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
                  isBookmarked
                    ? 'text-brand-teal-light bg-brand-teal/10 border border-brand-teal/20'
                    : 'text-slate-500 hover:text-brand-teal-light hover:bg-white/5'
                }`}
              >
                {isBookmarked ? '🔖 Saved' : '🔖 Save'}
              </button>
            )}
            <button
              onClick={onOpenNotes}
              className="flex-1 text-xs py-1.5 rounded-lg text-slate-500 hover:text-brand-teal-light hover:bg-white/5 transition-colors"
            >
              💬 Notes
            </button>
            {!isOwnBook && (
              <button
                onClick={onReport}
                className="text-xs text-slate-600 hover:text-red-400 transition-colors px-2 py-1.5"
              >
                Report
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
