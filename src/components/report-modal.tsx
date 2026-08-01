"use client"

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'

const REASONS = [
  'Inappropriate content',
  'Spam or fake listing',
  'Offensive language',
  'Suspicious activity',
  'Other',
]

export default function ReportModal({
  reportedUserId,
  reportedBookId,
  bookTitle,
  onClose,
}: {
  reportedUserId?: string
  reportedBookId?: string
  bookTitle?: string
  onClose: () => void
}) {
  const supabase = createClient()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (!reason) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_user_id: reportedUserId || null,
      reported_book_id: reportedBookId || null,
      reason,
      details: details.trim() || null,
    })

    setSubmitted(true)
    setSubmitting(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {submitted ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Report Submitted</h3>
            <p className="text-sm text-slate-600 mb-6">Thank you. We&apos;ll review this shortly.</p>
            <button onClick={onClose} className="text-sm text-brand-teal-dark hover:text-teal-700 transition-colors">
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-slate-900">Report</h3>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors text-sm">✕</button>
            </div>

            {bookTitle && (
              <p className="text-sm text-slate-600 mb-4">Reporting: <span className="text-slate-900">{bookTitle}</span></p>
            )}

            <div className="space-y-3 mb-5">
              {REASONS.map(r => (
                <label key={r} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-brand-teal"
                  />
                  <span className={`text-sm ${reason === r ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-700'} transition-colors`}>
                    {r}
                  </span>
                </label>
              ))}
            </div>

            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Add any additional details (optional)..."
              rows={3}
              className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-900 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none mb-5"
            />

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={!reason || submitting}
                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-40"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
