import Link from 'next/link'
import Image from 'next/image'
import { formatDistance } from '@/lib/geo'
import type { Book, Profile } from './types'

export default function BookCard({
  book,
  owner,
  progress,
}: {
  book: Book
  owner: Profile | undefined
  progress: number | undefined
}) {
  return (
    <Link
      href={`/books/${book.id}`}
      className="bg-white border border-black/5 rounded-2xl overflow-hidden hover:border-brand-teal/30 transition-colors flex flex-col"
    >
      {/* Cover image */}
      <div className="relative w-full aspect-[2/3] bg-gradient-to-br from-teal-50 to-slate-100 overflow-hidden">
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
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
        )}
        {/* Listing type badge over image */}
        <div className="absolute top-2 left-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${
            book.listing_type === 'donate'
              ? 'bg-brand-teal-dark text-white'
              : 'bg-blue-600 text-white'
          }`}>
            {book.listing_type === 'donate' ? '🎁 Donate' : '🤝 Lend'}
          </span>
        </div>
        {book.condition && (
          <div className="absolute top-2 right-2">
            <span className="text-xs text-white bg-slate-800 shadow-sm px-2 py-1 rounded-full capitalize">
              {book.condition}
            </span>
          </div>
        )}
        {book.status === 'given' && (
          <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2.5 px-4">
            <span className="bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
              Donated
            </span>
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
            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
              Being Read
            </span>
            {progress != null ? (
              <div className="w-4/5">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">Progress</span>
                  <span className="text-blue-700 font-semibold">{progress}%</span>
                </div>
                <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <span className="text-blue-600/60 text-xs">No progress yet</span>
            )}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-sm font-semibold mb-0.5 text-slate-900 leading-snug">{book.title}</h3>
        {book.author && <p className="text-slate-600 text-xs mb-2">by {book.author}</p>}

        <div className="flex items-center gap-2 flex-wrap mb-2">
          {book.genre && (
            <span className="inline-block bg-purple-500/10 text-purple-600 border border-purple-500/20 text-xs font-medium px-2.5 py-1 rounded-full">
              {book.genre}
            </span>
          )}
          {book.publication_year && (
            <span className="text-xs text-slate-500">{book.publication_year}</span>
          )}
        </div>

        {(book.distance_km != null || owner?.area_name) && (
          <p className="text-xs text-slate-500 mt-auto pt-3">
            {book.distance_km != null && (
              <span className="text-brand-teal-dark font-medium">{formatDistance(book.distance_km)}</span>
            )}
            {book.distance_km != null && owner?.area_name && ' · '}
            {owner?.area_name && <span>📍 {owner.area_name}</span>}
          </p>
        )}
      </div>
    </Link>
  )
}
