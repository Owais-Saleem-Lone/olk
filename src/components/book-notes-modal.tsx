"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { wordCount } from '@/lib/text-limits'

type Note = {
  id: string
  user_id: string
  note: string
  created_at: string
  profiles: { display_name: string | null } | null
}

export default function BookNotesModal({
  bookId,
  bookTitle,
  currentUserId,
  onClose,
}: {
  bookId: string
  bookTitle: string
  currentUserId: string
  onClose: () => void
}) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [myNote, setMyNote] = useState('')
  const [myNoteId, setMyNoteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('book_notes')
      .select('id, user_id, note, created_at, profiles!book_notes_user_id_fkey(display_name)')
      .eq('book_id', bookId)
      .order('created_at', { ascending: true })
      .limit(10)

    if (data) {
      setNotes(data as unknown as Note[])
      const mine = data.find(n => n.user_id === currentUserId)
      if (mine) {
        setMyNoteId(mine.id)
        setMyNote(mine.note)
      }
    }
    setLoading(false)
  }, [bookId, currentUserId])

  useEffect(() => { queueMicrotask(() => fetchNotes()) }, [fetchNotes])

  const otherNotesCount = notes.filter(n => n.user_id !== currentUserId).length
  const hasMyNote = myNoteId !== null
  const words = wordCount(myNote)
  const overLimit = words > 100

  const handleSave = async () => {
    if (!myNote.trim() || overLimit) return
    if (!hasMyNote && otherNotesCount >= 10) {
      setMessage('This book already has 10 community notes.')
      return
    }
    setSaving(true)
    setMessage('')
    const supabase = createClient()

    if (hasMyNote) {
      const { error } = await supabase
        .from('book_notes')
        .update({ note: myNote.trim() })
        .eq('id', myNoteId!)
      if (error) setMessage('Error saving: ' + error.message)
      else { setMessage('Note updated!'); fetchNotes() }
    } else {
      const { error } = await supabase
        .from('book_notes')
        .insert({ book_id: bookId, user_id: currentUserId, note: myNote.trim() })
      if (error) setMessage('Error saving: ' + error.message)
      else { setMessage('Note added!'); fetchNotes() }
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!myNoteId) return
    const supabase = createClient()
    await supabase.from('book_notes').delete().eq('id', myNoteId)
    setMyNote('')
    setMyNoteId(null)
    setMessage('')
    fetchNotes()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-brand-slate border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold">Community Notes</h3>
            <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">{bookTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors ml-4 mt-0.5 flex-shrink-0 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-5 min-h-0 pr-0.5">
          {loading && (
            <p className="text-slate-500 text-sm text-center py-6">Loading notes...</p>
          )}
          {!loading && notes.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-6">
              No notes yet — be the first to share your experience with this book.
            </p>
          )}
          {!loading && notes.map(n => (
            <div
              key={n.id}
              className={`rounded-xl p-4 border ${
                n.user_id === currentUserId
                  ? 'bg-brand-teal/[0.05] border-brand-teal/20'
                  : 'bg-white/[0.03] border-white/[0.06]'
              }`}
            >
              <p className="text-sm text-slate-300 leading-relaxed">{n.note}</p>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-xs text-slate-500">
                  {n.profiles?.display_name || 'Reader'}
                  {n.user_id === currentUserId && (
                    <span className="ml-1.5 text-brand-teal font-medium">(you)</span>
                  )}
                </span>
                <span className="text-xs text-slate-600">
                  {new Date(n.created_at).toLocaleDateString([], {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Add / edit own note */}
        <div className="border-t border-white/[0.06] pt-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-400">
              {hasMyNote ? 'Edit your note' : 'Add your note'}
            </label>
            <span className={`text-xs ${overLimit ? 'text-red-400' : 'text-slate-600'}`}>
              {words}/100 words
            </span>
          </div>
          <textarea
            value={myNote}
            onChange={e => { setMyNote(e.target.value); setMessage('') }}
            placeholder="Share your personal experience with this book..."
            rows={3}
            className={`w-full bg-white/5 border rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none mb-3 ${
              overLimit ? 'border-red-500/50' : 'border-white/10'
            }`}
          />
          {message && (
            <p className={`text-xs mb-3 ${
              message.startsWith('Error') || message.includes('already has') || message.includes('Please')
                ? 'text-red-400'
                : 'text-brand-teal-light'
            }`}>
              {message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || overLimit || !myNote.trim()}
              className="flex-1 bg-brand-teal hover:bg-brand-teal-light disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {saving ? 'Saving...' : hasMyNote ? 'Update Note' : 'Add Note'}
            </button>
            {hasMyNote && (
              <button
                onClick={handleDelete}
                className="px-4 py-2.5 text-sm text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
