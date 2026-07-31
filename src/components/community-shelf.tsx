'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

type ShelfBook = {
  id: string
  title: string
  author: string | null
  cover_url: string | null
  listing_type: string
}

const BookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
)

export default function CommunityShelf({ books }: { books: ShelfBook[] }) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const paused = useRef(false)

  useEffect(() => {
    if (books.length <= 1) return
    const id = setInterval(() => {
      if (paused.current) return
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % books.length)
        setVisible(true)
      }, 300)
    }, 2800)
    return () => clearInterval(id)
  }, [books.length])

  const book = books[index]

  return (
    <div
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-6 text-center">
        From the community
      </p>

      <div className="h-44 flex items-center justify-center gap-4">
        <div className={`flex items-center gap-4 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="relative flex-shrink-0 w-20 aspect-[2/3] rounded-lg overflow-hidden border border-black/5 shadow-md">
            {book.cover_url ? (
              <Image src={book.cover_url} alt={book.title} fill unoptimized sizes="80px" className="object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-teal-50 to-slate-100 flex items-center justify-center">
                <BookIcon />
              </div>
            )}
          </div>
          <div className="max-w-[160px]">
            <h3 className="font-semibold text-sm text-slate-900 leading-snug line-clamp-2">{book.title}</h3>
            {book.author && <p className="text-xs text-slate-500 mt-0.5 truncate">by {book.author}</p>}
            <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full border ${
              book.listing_type === 'donate'
                ? 'bg-teal-50 text-teal-700 border-teal-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {book.listing_type === 'donate' ? 'Free' : 'Lend'}
            </span>
          </div>
        </div>
      </div>

      {books.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {books.map((b, i) => (
            <span
              key={b.id}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-teal-500' : 'bg-slate-200'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
