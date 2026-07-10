"use client"

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { toast } from '@/hooks/use-toast'
import { compressImage, validateImageUrl } from '@/lib/image-utils'
import { createNotification } from '@/lib/notifications'
import { dueDaysLeft } from '@/lib/date-utils'
import ISBNScanner from '@/components/isbn-scanner'

type Book = {
  id: string
  title: string
  author: string | null
  condition: string | null
  listing_type: string
  status: string
  genre: string | null
  cover_url: string | null
  lending_duration_months: 1 | 2 | 3 | null
  acquired_via_donation: boolean
  read_count: number
}

type ReceivedBook = {
  id: string
  handed_over_at: string | null
  book_id: string
  books: {
    id: string
    title: string
    author: string | null
    cover_url: string | null
    genre: string | null
    listing_type: string
    lending_duration_months: number | null
  }
}

// Kept outside the component: Date.now() is an impure call the React
// Compiler's purity check flags wherever it's written, even though this one
// only ever runs from an upload event handler, never during render.
function timestampedPath(userId: string, ext: string | undefined) {
  return `${userId}/${Date.now()}.${ext}`
}

export default function MyBooksPage() {
  const supabase = createClient()

  // ── Add book form state ──
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [condition, setCondition] = useState('good')
  const [listingType, setListingType] = useState('donate')
  const [genre, setGenre] = useState('General')
  const [description, setDescription] = useState('')
  const [publicationYear, setPublicationYear] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [lendingDuration, setLendingDuration] = useState<1|2|3>(1)
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [message, setMessage] = useState('')

  // ── Book list state ──
  const [myBooks, setMyBooks] = useState<Book[]>([])

  // ── Received books state ──
  const [receivedBooks, setReceivedBooks] = useState<ReceivedBook[]>([])
  const [receivedProgress, setReceivedProgress] = useState<Record<string, number>>({})
  const [updatingProgressId, setUpdatingProgressId] = useState<string | null>(null)
  const [progressDraft, setProgressDraft] = useState(0)
  const [confirmPassOnId, setConfirmPassOnId] = useState<string | null>(null)
  const [passingOnId, setPassingOnId] = useState<string | null>(null)

  // ── Edit state ──
  const [editingBookId, setEditingBookId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editStatus, setEditStatus] = useState('available')
  const [editGenre, setEditGenre] = useState('General')
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [editCoverPreview, setEditCoverPreview] = useState('')
  const [editCoverUrl, setEditCoverUrl] = useState('')
  const [editLendingDuration, setEditLendingDuration] = useState<1|2|3>(1)
  const [editLoading, setEditLoading] = useState(false)
  const [editMessage, setEditMessage] = useState('')

  // ── Delete state ──
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const fetchMyBooks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('books').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: false })
    if (!error && data) setMyBooks(data)
  }, [supabase])

  const fetchReceivedBooks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('book_requests')
      .select('id, handed_over_at, book_id, books(id, title, author, cover_url, genre, listing_type, lending_duration_months)')
      .eq('requester_id', user.id)
      .eq('status', 'handed_over')
      .order('handed_over_at', { ascending: false })
    if (error || !data) return
    const receivedBooks = data as unknown as ReceivedBook[]
    setReceivedBooks(receivedBooks)
    const bookIds = receivedBooks.map((r) => r.book_id)
    if (bookIds.length === 0) return
    const { data: prog } = await supabase
      .from('book_progress')
      .select('book_id, progress_pct')
      .in('book_id', bookIds)
      .eq('reader_id', user.id)
    if (prog) {
      const pm: Record<string, number> = {}
      prog.forEach((p: { book_id: string; progress_pct: number }) => { pm[p.book_id] = p.progress_pct })
      setReceivedProgress(pm)
    }
  }, [supabase])

  useAsyncEffect(() => { fetchMyBooks(); fetchReceivedBooks() }, [fetchMyBooks, fetchReceivedBooks])

  // ── Cover helpers ──
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
    const path = timestampedPath(userId, ext)
    const { error } = await supabase.storage.from('book-covers').upload(path, compressed)
    if (error) return { url: null, error: error.message }
    const { data } = supabase.storage.from('book-covers').getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  }

  // ── Add book ──
  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMessage('You must be logged in'); setLoading(false); return }

    let finalCoverUrl: string | null = coverUrl.trim() || null
    if (coverFile) {
      const { url, error } = await uploadCover(coverFile, user.id)
      if (error) { setMessage('Cover upload failed: ' + error); setLoading(false); return }
      finalCoverUrl = url
    }

    const { data: newBook, error } = await supabase.from('books').insert({
      title, author, condition, listing_type: listingType,
      genre, cover_url: finalCoverUrl, owner_id: user.id,
      lending_duration_months: listingType === 'lend' ? lendingDuration : null,
      description: description.trim() || null,
      publication_year: publicationYear ? parseInt(publicationYear, 10) : null,
    }).select('id').single()

    if (error) {
      setMessage('Error adding book: ' + error.message)
    } else {
      setMessage('Book added successfully!')

      const { data: matches } = await supabase
        .rpc('match_wishlists_for_book', { p_title: title, p_owner_id: user.id })

      if (matches && matches.length > 0) {
        for (const match of matches) {
          if (newBook) {
            await supabase.from('wishlists').update({ matched_book_id: newBook.id }).eq('id', match.id)
          }
          await createNotification({
            userId: match.user_id,
            type: 'book_requested',
            title: `A book on your wishlist is now available: "${title}"`,
            link: `/browse?q=${encodeURIComponent(title)}`,
            context: { kind: 'wishlist_match', id: match.id },
          })
        }
      }

      setTitle(''); setAuthor(''); setGenre('General')
      setDescription(''); setPublicationYear('')
      setCoverFile(null); setCoverUrl(''); setCoverPreview('')
      fetchMyBooks()
    }
    setLoading(false)
  }

  // ── Edit ──
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

    const bookBeingEdited = myBooks.find(b => b.id === bookId)
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
      fetchMyBooks()
    }
    setEditLoading(false)
  }

  // ── Delete ──
  const handleDelete = async (bookId: string) => {
    const { error } = await supabase.from('books').delete().eq('id', bookId)
    if (!error) {
      setConfirmDeleteId(null)
      if (editingBookId === bookId) cancelEdit()
      fetchMyBooks()
    }
  }

  // ── Reading progress update (received books) ──
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
    setReceivedProgress(prev => ({ ...prev, [bookId]: progressDraft }))
  }

  // ── Pass It On: transfer donated book back to community ──
  const handlePassItOn = async (requestId: string) => {
    setPassingOnId(requestId)
    const { error } = await supabase.rpc('complete_donated_book_reading', { p_request_id: requestId })
    if (error) { toast.error('Error: ' + error.message) }
    else { setConfirmPassOnId(null); fetchMyBooks(); fetchReceivedBooks() }
    setPassingOnId(null)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">My Books</h1>
      <p className="text-slate-400 mb-8">Add a book to donate or lend</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* ── LEFT: Add Book Form ── */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Add a New Book</h2>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/></svg>
              Scan ISBN
            </button>
          </div>
          <form onSubmit={handleAddBook} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Book Title</label>
              <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                placeholder="e.g., The Alchemist" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Author</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                placeholder="e.g., Paulo Coelho" />
            </div>

            <CoverInput
              preview={coverPreview}
              onFileChange={makeFileHandler(setCoverFile, setCoverPreview, setCoverUrl, setMessage)}
              onUrlChange={(v) => { setCoverUrl(v); setCoverFile(null); setCoverPreview(v) }}
              urlValue={coverUrl}
              onClear={() => { setCoverFile(null); setCoverUrl(''); setCoverPreview('') }}
            />

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
              <select value={genre} onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
                <optgroup label="Natural Sciences" className="bg-brand-slate">
                  <option value="Physics" className="bg-brand-slate">Physics</option>
                  <option value="Chemistry" className="bg-brand-slate">Chemistry</option>
                  <option value="Biology" className="bg-brand-slate">Biology</option>
                  <option value="Mathematics" className="bg-brand-slate">Mathematics</option>
                </optgroup>
                <optgroup label="Engineering" className="bg-brand-slate">
                  <option value="Civil Engineering" className="bg-brand-slate">Civil Engineering</option>
                  <option value="Mechanical Engineering" className="bg-brand-slate">Mechanical Engineering</option>
                  <option value="Electrical Engineering" className="bg-brand-slate">Electrical Engineering</option>
                  <option value="IT/Computer Science" className="bg-brand-slate">IT/Computer Science</option>
                </optgroup>
                <optgroup label="Medicine" className="bg-brand-slate">
                  <option value="Anatomy" className="bg-brand-slate">Anatomy</option>
                  <option value="Physiology" className="bg-brand-slate">Physiology</option>
                  <option value="Clinical Medicine" className="bg-brand-slate">Clinical Medicine</option>
                </optgroup>
                <optgroup label="Social Sciences" className="bg-brand-slate">
                  <option value="History" className="bg-brand-slate">History</option>
                  <option value="Civics" className="bg-brand-slate">Civics</option>
                  <option value="Geography" className="bg-brand-slate">Geography</option>
                  <option value="Psychology" className="bg-brand-slate">Psychology</option>
                  <option value="Philosophy" className="bg-brand-slate">Philosophy</option>
                </optgroup>
                <optgroup label="Literature" className="bg-brand-slate">
                  <option value="English Literature" className="bg-brand-slate">English Literature</option>
                  <option value="Urdu Literature" className="bg-brand-slate">Urdu Literature</option>
                  <option value="Hindi Literature" className="bg-brand-slate">Hindi Literature</option>
                  <option value="Persian Literature" className="bg-brand-slate">Persian Literature</option>
                  <option value="Arabic Literature" className="bg-brand-slate">Arabic Literature</option>
                  <option value="Kashmiri Literature" className="bg-brand-slate">Kashmiri Literature</option>
                </optgroup>
                <optgroup label="Other" className="bg-brand-slate">
                  <option value="General" className="bg-brand-slate">General / Other</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Publication Year <span className="text-slate-500 font-normal">(optional)</span></label>
              <input type="number" min="1000" max="2200" value={publicationYear} onChange={(e) => setPublicationYear(e.target.value)}
                placeholder="e.g., 2008"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Description <span className="text-slate-500 font-normal">(optional)</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                placeholder="A short blurb about the book..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
                <option value="excellent" className="bg-brand-slate">Excellent</option>
                <option value="good" className="bg-brand-slate">Good</option>
                <option value="fair" className="bg-brand-slate">Fair</option>
                <option value="poor" className="bg-brand-slate">Poor</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">I want to</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="donate" checked={listingType === 'donate'} onChange={(e) => setListingType(e.target.value)} className="accent-brand-teal" />
                  <span className="text-white">Donate</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="lend" checked={listingType === 'lend'} onChange={(e) => setListingType(e.target.value)} className="accent-brand-teal" />
                  <span className="text-white">Lend</span>
                </label>
              </div>
            </div>

            {listingType === 'lend' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Lending Period</label>
                <div className="flex gap-5">
                  {([1, 2, 3] as const).map(m => (
                    <label key={m} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value={m} checked={lendingDuration === m} onChange={() => setLendingDuration(m)} className="accent-brand-teal" />
                      <span className="text-white text-sm">{m} {m === 1 ? 'month' : 'months'}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors">
              {loading ? 'Adding...' : 'Add Book'}
            </button>

            {message && (
              <p className={`text-sm text-center ${message.includes('success') ? 'text-brand-teal-light' : 'text-red-400'}`}>
                {message}
              </p>
            )}
          </form>
        </div>

        {/* ── RIGHT: Your Listed Books + Books in Your Possession ── */}
        <div className="flex flex-col gap-8">

          {/* ── Your Listed Books ── */}
          <div>
            <h2 className="text-xl font-semibold mb-6">Your Listed Books</h2>

            {myBooks.length === 0 && (
              <div className="text-center py-10 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                <p className="text-slate-500">You haven&apos;t added any books yet.</p>
              </div>
            )}

            <div className="space-y-3">
              {myBooks.map((book) => (
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
                          <select value={editGenre} onChange={(e) => setEditGenre(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
                            <optgroup label="Natural Sciences" className="bg-brand-slate">
                              <option value="Physics" className="bg-brand-slate">Physics</option>
                              <option value="Chemistry" className="bg-brand-slate">Chemistry</option>
                              <option value="Biology" className="bg-brand-slate">Biology</option>
                              <option value="Mathematics" className="bg-brand-slate">Mathematics</option>
                            </optgroup>
                            <optgroup label="Engineering" className="bg-brand-slate">
                              <option value="Civil Engineering" className="bg-brand-slate">Civil Engineering</option>
                              <option value="Mechanical Engineering" className="bg-brand-slate">Mechanical Engineering</option>
                              <option value="Electrical Engineering" className="bg-brand-slate">Electrical Engineering</option>
                              <option value="IT/Computer Science" className="bg-brand-slate">IT/Computer Science</option>
                            </optgroup>
                            <optgroup label="Medicine" className="bg-brand-slate">
                              <option value="Anatomy" className="bg-brand-slate">Anatomy</option>
                              <option value="Physiology" className="bg-brand-slate">Physiology</option>
                              <option value="Clinical Medicine" className="bg-brand-slate">Clinical Medicine</option>
                            </optgroup>
                            <optgroup label="Social Sciences" className="bg-brand-slate">
                              <option value="History" className="bg-brand-slate">History</option>
                              <option value="Civics" className="bg-brand-slate">Civics</option>
                              <option value="Geography" className="bg-brand-slate">Geography</option>
                              <option value="Psychology" className="bg-brand-slate">Psychology</option>
                              <option value="Philosophy" className="bg-brand-slate">Philosophy</option>
                            </optgroup>
                            <optgroup label="Literature" className="bg-brand-slate">
                              <option value="English Literature" className="bg-brand-slate">English Literature</option>
                              <option value="Urdu Literature" className="bg-brand-slate">Urdu Literature</option>
                              <option value="Hindi Literature" className="bg-brand-slate">Hindi Literature</option>
                              <option value="Persian Literature" className="bg-brand-slate">Persian Literature</option>
                              <option value="Arabic Literature" className="bg-brand-slate">Arabic Literature</option>
                              <option value="Kashmiri Literature" className="bg-brand-slate">Kashmiri Literature</option>
                            </optgroup>
                            <optgroup label="Other" className="bg-brand-slate">
                              <option value="General" className="bg-brand-slate">General / Other</option>
                            </optgroup>
                          </select>
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

          {/* ── Books in Your Possession ── */}
          {receivedBooks.length > 0 && (
            <div className="border-t border-white/[0.06] pt-6">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold">Books in Your Possession</h2>
                <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-full">
                  {receivedBooks.length}
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-4">Books donated or lent to you that you currently have</p>

              <div className="space-y-3">
                {receivedBooks.map(req => {
                  const book = req.books
                  const isDonated = book.listing_type === 'donate'
                  const progress = receivedProgress[book.id]

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
                              {progress != null && (
                                <div className="mb-2">
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-slate-500">Reading progress</span>
                                    <span className={`font-semibold ${isDonated ? 'text-brand-teal-light' : 'text-blue-400'}`}>{progress}%</span>
                                  </div>
                                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${isDonated ? 'bg-brand-teal-light' : 'bg-blue-400'}`}
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 mt-2">
                                <button
                                  onClick={() => { setUpdatingProgressId(req.id); setProgressDraft(progress ?? 0) }}
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
          )}

        </div>
      </div>

      {showScanner && (
        <ISBNScanner
          onResult={(data) => {
            setTitle(data.title)
            setAuthor(data.author)
            if (data.coverUrl) {
              setCoverUrl(data.coverUrl)
              setCoverPreview(data.coverUrl)
              setCoverFile(null)
            }
            if (data.genre) setGenre(data.genre)
            if (data.publicationYear) setPublicationYear(String(data.publicationYear))
            if (data.description) setDescription(data.description)
            setShowScanner(false)
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}

// ── Reusable cover input component ──
function CoverInput({
  preview,
  onFileChange,
  onUrlChange,
  urlValue,
  onClear,
}: {
  preview: string
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUrlChange: (v: string) => void
  urlValue: string
  onClear: () => void
}) {
  const [validating, setValidating] = useState(false)
  const [urlError, setUrlError] = useState('')

  const handleUrlBlur = async () => {
    const url = urlValue.trim()
    if (!url) { setUrlError(''); return }
    setValidating(true)
    setUrlError('')
    const valid = await validateImageUrl(url)
    setValidating(false)
    if (!valid) {
      setUrlError('Image could not be loaded. Check the URL.')
      onClear()
    }
  }

  return preview ? (
    <div className="relative inline-block">
      {/* next/image can't handle this: preview is a data: URL (local file), a blob,
          or an arbitrary pasted/ISBN-scan URL with no known host or intrinsic size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Cover preview"
        className="h-32 rounded-xl object-cover border border-white/10"
        onError={onClear} />
      <button type="button" onClick={onClear}
        className="absolute -top-2 -right-2 w-6 h-6 bg-brand-slate-muted hover:bg-red-500 border border-white/10 rounded-full text-white text-xs flex items-center justify-center transition-colors">
        ✕
      </button>
    </div>
  ) : (
    <>
      <label className="flex flex-col items-center gap-2 border-2 border-dashed border-white/10 hover:border-brand-teal/40 rounded-xl p-5 cursor-pointer transition-colors group">
        <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 group-hover:text-brand-teal transition-colors">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>
        </svg>
        <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Upload a photo</span>
        <span className="text-xs text-slate-600">JPG, PNG, WebP — auto-compressed under 500KB</span>
      </label>
      <div className="flex items-center gap-3 my-3">
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-xs text-slate-600">or paste a URL</span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
      <input type="url" value={urlValue}
        onChange={(e) => { onUrlChange(e.target.value); setUrlError('') }}
        onBlur={handleUrlBlur}
        className={`w-full bg-white/5 border rounded-lg px-4 py-2.5 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal ${urlError ? 'border-red-500/50' : 'border-white/10'}`}
        placeholder="https://..." />
      {validating && <p className="text-xs text-slate-500 mt-1">Validating image...</p>}
      {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
    </>
  )
}
