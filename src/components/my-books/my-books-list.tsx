"use client"

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image-utils'
import GenreSelect from '@/components/genre-select'
import CoverInput from './cover-input'
import type { Book } from './types'

export default function MyBooksList({ books, onChange }: { books: Book[]; onChange: () => void }) {
  const supabase = createClient()

  const [editingBookId, setEditingBookId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editStatus, setEditStatus] = useState('available')
  const [editGenre, setEditGenre] = useState('General')
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [editCoverPreview, setEditCoverPreview] = useState('')
  const [editCoverUrl, setEditCoverUrl] = useState('')
  const [editLendingDuration, setEditLendingDuration] = useState<1 | 2 | 3>(1)
  const [editLoading, setEditLoading] = useState(false)
  const [editMessage, setEditMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const makeFileHandler = (
    setFile: (f: File | null) => void,
    setPreview: (s: string) => void,
    setUrl: (s: string) => void,
    setMsg: (s: string) => void
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setMsg('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setMsg('Image must be smaller than 5MB'); return }
    setFile(file)
    setUrl('')
    setMsg('')
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const uploadCover = async (file: File, userId: string) => {
    const compressed = await compressImage(file)
    const ext = compressed.name.split('.').pop()
    const path = `${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('book-covers').upload(path, compressed)
    if (error) return { url: null, error: error.message }
    const { data } = supabase.storage.from('book-covers').getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  }

  const startEdit = (book: Book) => {
    setEditingBookId(book.id)
    setEditTitle(book.title)
    setEditAuthor(book.author || '')
    setEditStatus(book.status)
    setEditGenre(book.genre || 'General')
    setEditLendingDuration(book.lending_duration_months ?? 1)
    setEditCoverPreview(book.cover_url || '')
    setEditCoverUrl(book.cover_url || '')
    setEditCoverFile(null)
    setEditMessage('')
    setConfirmDeleteId(null)
  }

  const cancelEdit = () => {
    setEditingBookId(null)
    setEditCoverFile(null)
    setEditCoverPreview('')
    setEditCoverUrl('')
    setEditMessage('')
  }

  const handleSaveEdit = async (bookId: string) => {
    setEditLoading(true)
    setEditMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setEditLoading(false); return }

    let finalCoverUrl: string | null = editCoverUrl.trim() || null
    if (editCoverFile) {
      const { url, error } = await uploadCover(editCoverFile, user.id)
      if (error) { setEditMessage('Cover upload failed: ' + error); setEditLoading(false); return }
      finalCoverUrl = url
    }

    const bookBeingEdited = books.find(b => b.id === bookId)
    const { error } = await supabase.from('books').update({
      title: editTitle,
      author: editAuthor,
      status: editStatus,
      genre: editGenre,
      cover_url: finalCoverUrl,
      lending_duration_months: bookBeingEdited?.listing_type === 'lend' ? editLendingDuration : null,
    }).eq('id', bookId)

    if (error) {
      setEditMessage('Error saving: ' + error.message)
    } else {
      cancelEdit()
      onChange()
    }
    setEditLoading(false)
  }

  const handleDelete = async (bookId: string) => {
    const { error } = await supabase.from('books').delete().eq('id', bookId)
    if (!error) {
      setConfirmDeleteId(null)
      if (editingBookId === bookId) cancelEdit()
      onChange()
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Your Listed Books</h2>

      {books.length === 0 && (
        <div className="text-center py-10 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
          <p className="text-slate-500">You haven&apos;t added any books yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {books.map((book) => (
          <div key={book.id}>
            {/* Book row */}
            <div className={`bg-white/[0.03] border rounded-xl p-4 flex gap-4 items-center transition-colors ${
              editingBookId === book.id ? 'border-brand-teal/30' : 'border-white/[0.06]'
            }`}>
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
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {book.genre && <span className="text-xs text-brand-teal-light">{book.genre}</span>}
                  {book.acquired_via_donation && (
                    <span className="text-xs text-amber-400/80">· 🔄 In Circulation</span>
                  )}
                  {book.read_count > 0 && (
                    <span className="text-xs text-slate-500">· Read {book.read_count}×</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  book.status === 'available'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                }`}>
                  {book.status}
                </span>

                {editingBookId === book.id ? (
                  <button onClick={cancelEdit}
                    className="text-xs text-slate-500 hover:text-white px-2 py-1 rounded transition-colors">
                    Cancel
                  </button>
                ) : (
                  <>
                    <button onClick={() => startEdit(book)}
                      className="text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
                      Edit
                    </button>
                    {!book.acquired_via_donation && (
                      confirmDeleteId === book.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-400">Sure?</span>
                          <button onClick={() => handleDelete(book.id)}
                            className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-2.5 py-1.5 rounded-lg transition-colors">
                            Yes, delete
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-slate-500 hover:text-white px-2 py-1.5 rounded-lg transition-colors">
                            No
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(book.id)}
                          className="text-xs text-red-400/70 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors">
                          Delete
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Inline edit panel */}
            {editingBookId === book.id && (
              <div className="mt-1 bg-white/[0.02] border border-brand-teal/20 border-t-0 rounded-b-xl px-5 pb-5 pt-4 space-y-4">
                {book.acquired_via_donation && (
                  <p className="text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                    🔄 This book is in permanent circulation — it can only be donated forward, not deleted.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Author</label>
                    <input type="text" value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
                      <option value="available" className="bg-brand-slate">Available</option>
                      <option value="unavailable" className="bg-brand-slate">Unavailable</option>
                      <option value="given" className="bg-brand-slate">Given Away</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                    <GenreSelect
                      value={editGenre}
                      onChange={setEditGenre}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
                    />
                  </div>
                </div>

                {book.listing_type === 'lend' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Lending Period</label>
                    <div className="flex gap-5">
                      {([1, 2, 3] as const).map(m => (
                        <label key={m} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" value={m} checked={editLendingDuration === m} onChange={() => setEditLendingDuration(m)} className="accent-brand-teal" />
                          <span className="text-white text-sm">{m} {m === 1 ? 'month' : 'months'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Cover Photo</label>
                  <CoverInput
                    preview={editCoverPreview}
                    onFileChange={makeFileHandler(setEditCoverFile, setEditCoverPreview, setEditCoverUrl, setEditMessage)}
                    onUrlChange={(v) => { setEditCoverUrl(v); setEditCoverFile(null); setEditCoverPreview(v) }}
                    urlValue={editCoverUrl}
                    onClear={() => { setEditCoverFile(null); setEditCoverUrl(''); setEditCoverPreview('') }}
                  />
                </div>

                {editMessage && <p className="text-xs text-red-400">{editMessage}</p>}

                <div className="flex gap-3 pt-1">
                  <button onClick={() => handleSaveEdit(book.id)} disabled={editLoading}
                    className="bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors">
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={cancelEdit}
                    className="text-sm text-slate-400 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
