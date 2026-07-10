"use client"

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { dueDaysLeft } from '@/lib/date-utils'
import type { ReceivedBook } from './types'

export default function ReceivedBooksList({
  items,
  progress,
  onProgressSaved,
  onChange,
}: {
  items: ReceivedBook[]
  progress: Record<string, number>
  onProgressSaved: (bookId: string, pct: number) => void
  onChange: () => void
}) {
  const supabase = createClient()

  const [updatingProgressId, setUpdatingProgressId] = useState<string | null>(null)
  const [progressDraft, setProgressDraft] = useState(0)
  const [confirmPassOnId, setConfirmPassOnId] = useState<string | null>(null)
  const [passingOnId, setPassingOnId] = useState<string | null>(null)

  const handleSaveProgress = async (requestId: string, bookId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('book_progress').upsert({
      request_id: requestId,
      book_id: bookId,
      reader_id: user.id,
      progress_pct: progressDraft,
    }, { onConflict: 'request_id' })
    setUpdatingProgressId(null)
    onProgressSaved(bookId, progressDraft)
  }

  const handlePassItOn = async (requestId: string) => {
    setPassingOnId(requestId)
    const { error } = await supabase.rpc('complete_donated_book_reading', { p_request_id: requestId })
    if (error) { toast.error('Error: ' + error.message) }
    else { setConfirmPassOnId(null); onChange() }
    setPassingOnId(null)
  }

  if (items.length === 0) return null

  return (
    <div className="border-t border-white/[0.06] pt-6">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-semibold">Books in Your Possession</h2>
        <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-full">
          {items.length}
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">Books donated or lent to you that you currently have</p>

      <div className="space-y-3">
        {items.map(req => {
          const book = req.books
          const isDonated = book.listing_type === 'donate'
          const bookProgress = progress[book.id]

          const daysLeft = !isDonated
            ? dueDaysLeft(req.handed_over_at, book.lending_duration_months)
            : null

          return (
            <div key={req.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.10] transition-colors">
              <div className="flex gap-4">
                <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-brand-slate-light flex-shrink-0 border border-white/5">
                  {book.cover_url ? (
                    <Image src={book.cover_url} alt={book.title} fill unoptimized sizes="48px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-lg font-bold">
                      {book.title[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate">{book.title}</h3>
                  {book.author && <p className="text-sm text-slate-400 truncate">by {book.author}</p>}

                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isDonated
                        ? 'bg-brand-teal/10 text-brand-teal-light border border-brand-teal/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {isDonated ? 'Donated to you' : 'On Loan'}
                    </span>
                    {daysLeft !== null && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        daysLeft < 0
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : daysLeft === 0
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {daysLeft < 0 ? `Overdue by ${Math.abs(daysLeft)}d` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                      </span>
                    )}
                  </div>

                  {updatingProgressId === req.id ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="range" min={0} max={100} value={progressDraft}
                          onChange={e => setProgressDraft(Number(e.target.value))}
                          className="flex-1 accent-brand-teal"
                        />
                        <span className={`text-xs font-semibold w-9 text-right ${isDonated ? 'text-brand-teal-light' : 'text-blue-400'}`}>
                          {progressDraft}%
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveProgress(req.id, req.book_id)}
                          className="text-xs bg-brand-teal hover:bg-brand-teal-light text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setUpdatingProgressId(null)}
                          className="text-xs text-slate-500 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      {bookProgress != null && (
                        <div className="mb-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500">Reading progress</span>
                            <span className={`font-semibold ${isDonated ? 'text-brand-teal-light' : 'text-blue-400'}`}>{bookProgress}%</span>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isDonated ? 'bg-brand-teal-light' : 'bg-blue-400'}`}
                              style={{ width: `${bookProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          onClick={() => { setUpdatingProgressId(req.id); setProgressDraft(bookProgress ?? 0) }}
                          className="text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Update Progress
                        </button>
                        {isDonated && (
                          confirmPassOnId === req.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-400">Release to community?</span>
                              <button
                                onClick={() => handlePassItOn(req.id)}
                                disabled={passingOnId === req.id}
                                className="text-xs bg-brand-teal/20 text-brand-teal-light hover:bg-brand-teal/30 border border-brand-teal/30 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {passingOnId === req.id ? '...' : 'Yes, pass it on'}
                              </button>
                              <button
                                onClick={() => setConfirmPassOnId(null)}
                                className="text-xs text-slate-500 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmPassOnId(req.id)}
                              className="text-xs text-brand-teal-light hover:text-teal-300 bg-brand-teal/10 hover:bg-brand-teal/15 border border-brand-teal/20 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Pass It On 🔄
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
