"use client"

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RatingModal({
  requestId,
  raterId,
  ratedUserId,
  ratedUserName,
  bookTitle,
  onClose,
  onSubmitted,
}: {
  requestId: string
  raterId: string
  ratedUserId: string
  ratedUserName: string
  bookTitle: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const [score, setScore] = useState(0)
  const [hoveredScore, setHoveredScore] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (score === 0) return
    setSubmitting(true)
    setError('')

    const supabase = createClient()
    const { error: submitError } = await supabase.from('ratings').insert({
      request_id: requestId,
      rater_id: raterId,
      rated_user_id: ratedUserId,
      score,
      comment: comment.trim() || null,
    })

    if (submitError) {
      setError(submitError.code === '23505' ? 'You have already rated this exchange.' : 'Error submitting rating: ' + submitError.message)
    } else {
      onSubmitted()
    }

    setSubmitting(false)
  }

  const displayScore = hoveredScore || score

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Rate your experience</h3>
        <p className="text-sm text-slate-400 mb-5">
          How was your exchange with <span className="text-white">{ratedUserName}</span> for <span className="text-teal-400">&quot;{bookTitle}&quot;</span>?
        </p>

        {/* Stars */}
        <div className="flex justify-center gap-2 mb-5">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onMouseEnter={() => setHoveredScore(s)}
              onMouseLeave={() => setHoveredScore(0)}
              onClick={() => setScore(s)}
              className="text-3xl transition-transform hover:scale-110"
            >
              {s <= displayScore ? '★' : '☆'}
            </button>
          ))}
        </div>
        {displayScore > 0 && (
          <p className="text-center text-sm text-slate-400 mb-4">
            {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][displayScore]}
          </p>
        )}

        {/* Comment */}
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Optional comment..."
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none mb-4"
        />

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={score === 0 || submitting}
            className="flex-1 bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
