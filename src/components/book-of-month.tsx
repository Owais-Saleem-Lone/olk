"use client"

import { useState, useEffect } from 'react'

type BookOfMonth = {
  title: string
  author: string | null
  description: string | null
  cover_url: string | null
  month_label: string | null
}

const BookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700/60">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
)

export default function BookOfMonthCard({ book }: { book: BookOfMonth }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) {
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      {/* ── Preview Card ── */}
      <div className="relative bg-gradient-to-br from-amber-500/[0.07] via-yellow-500/[0.04] to-transparent border border-amber-500/20 rounded-3xl p-8 overflow-hidden">
        <div className="pointer-events-none absolute -top-10 -right-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />

        <div className="relative flex gap-8 items-start">
          {/* Cover */}
          <div className="flex-shrink-0 w-36 aspect-[2/3] rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-black/40">
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-900/40 to-slate-900 flex items-center justify-center">
                <BookIcon />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 py-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">✦ Book of the Month</span>
              {book.month_label && (
                <span className="text-xs text-slate-500">— {book.month_label}</span>
              )}
            </div>

            <h3 className="text-2xl font-bold text-white leading-tight mb-1">{book.title}</h3>
            {book.author && (
              <p className="text-slate-400 text-sm mb-4">by {book.author}</p>
            )}
            {book.description && (
              <p className="text-slate-300 text-sm leading-relaxed line-clamp-3 mb-5">
                {book.description}
              </p>
            )}

            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors group"
            >
              Read More
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          {/* Dark backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

          {/* Panel — outer glow ring */}
          <div
            className="relative max-w-lg w-full rounded-3xl shadow-[0_0_80px_-8px_rgba(245,158,11,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient border */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-400/50 via-yellow-500/20 to-amber-600/40 p-px">
              <div className="w-full h-full rounded-3xl bg-[#0f1107]" />
            </div>

            {/* Solid dark content area */}
            <div className="relative rounded-3xl bg-gradient-to-br from-[#1c1a05] via-[#111008] to-[#0c0f0a] p-8 overflow-hidden">
              {/* Inner ambient glow */}
              <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-72 h-28 bg-amber-500/10 blur-3xl rounded-full" />

              {/* Close button */}
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:text-amber-200 transition-colors text-sm"
              >
                ✕
              </button>

              {/* Cover + title row */}
              <div className="relative flex gap-6 mb-6">
                <div className="flex-shrink-0 w-28 aspect-[2/3] rounded-xl overflow-hidden border border-amber-500/20 shadow-xl shadow-black/60">
                  {book.cover_url ? (
                    <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-900/40 to-slate-900 flex items-center justify-center">
                      <BookIcon />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 py-1">
                  <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">✦ Book of the Month</span>
                  {book.month_label && (
                    <p className="text-amber-600/70 text-xs mt-0.5 mb-3">{book.month_label}</p>
                  )}
                  <h2 className="text-xl font-bold text-white leading-tight mb-1">{book.title}</h2>
                  {book.author && (
                    <p className="text-slate-400 text-sm">by {book.author}</p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="relative border-t border-amber-500/10 mb-5" />

              {/* Description */}
              {book.description ? (
                <p className="relative text-slate-200 text-sm leading-relaxed">{book.description}</p>
              ) : (
                <p className="relative text-slate-500 text-sm italic">No description added yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
