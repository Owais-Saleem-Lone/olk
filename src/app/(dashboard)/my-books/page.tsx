"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Book = {
  id: string
  title: string
  author: string | null
  condition: string | null
  listing_type: string
  status: string
  genre: string | null
  cover_url: string | null
}

export default function MyBooksPage() {
  const supabase = createClient()

  // ── Add book form state ──
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [condition, setCondition] = useState('good')
  const [listingType, setListingType] = useState('donate')
  const [genre, setGenre] = useState('General')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // ── Book list state ──
  const [myBooks, setMyBooks] = useState<Book[]>([])

  // ── Edit state ──
  const [editingBookId, setEditingBookId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editStatus, setEditStatus] = useState('available')
  const [editGenre, setEditGenre] = useState('General')
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [editCoverPreview, setEditCoverPreview] = useState('')
  const [editCoverUrl, setEditCoverUrl] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editMessage, setEditMessage] = useState('')

  // ── Delete state ──
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => { fetchMyBooks() }, [])

  const fetchMyBooks = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('books').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: false })
    if (!error && data) setMyBooks(data)
  }

  // ── Cover helpers (shared logic) ──
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
    const ext = file.name.split('.').pop()
    const path = `${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('book-covers').upload(path, file)
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

    const { error } = await supabase.from('books').insert({
      title, author, condition, listing_type: listingType,
      genre, cover_url: finalCoverUrl, owner_id: user.id,
    })

    if (error) {
      setMessage('Error adding book: ' + error.message)
    } else {
      setMessage('Book added successfully!')
      setTitle(''); setAuthor(''); setGenre('General')
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

    const { error } = await supabase.from('books').update({
      title: editTitle,
      author: editAuthor,
      status: editStatus,
      genre: editGenre,
      cover_url: finalCoverUrl,
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

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">My Books</h1>
      <p className="text-slate-400 mb-8">Add a book to donate or lend</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* ── LEFT: Add Book Form ── */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-6">Add a New Book</h2>
          <form onSubmit={handleAddBook} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Book Title</label>
              <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g., The Alchemist" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Author</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g., Paulo Coelho" />
            </div>

            {/* Cover */}
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
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                <optgroup label="Natural Sciences" className="bg-slate-900">
                  <option value="Physics" className="bg-slate-900">Physics</option>
                  <option value="Chemistry" className="bg-slate-900">Chemistry</option>
                  <option value="Biology" className="bg-slate-900">Biology</option>
                  <option value="Mathematics" className="bg-slate-900">Mathematics</option>
                </optgroup>
                <optgroup label="Engineering" className="bg-slate-900">
                  <option value="Civil Engineering" className="bg-slate-900">Civil Engineering</option>
                  <option value="Mechanical Engineering" className="bg-slate-900">Mechanical Engineering</option>
                  <option value="Electrical Engineering" className="bg-slate-900">Electrical Engineering</option>
                  <option value="IT/Computer Science" className="bg-slate-900">IT/Computer Science</option>
                </optgroup>
                <optgroup label="Medicine" className="bg-slate-900">
                  <option value="Anatomy" className="bg-slate-900">Anatomy</option>
                  <option value="Physiology" className="bg-slate-900">Physiology</option>
                  <option value="Clinical Medicine" className="bg-slate-900">Clinical Medicine</option>
                </optgroup>
                <optgroup label="Social Sciences" className="bg-slate-900">
                  <option value="History" className="bg-slate-900">History</option>
                  <option value="Civics" className="bg-slate-900">Civics</option>
                  <option value="Geography" className="bg-slate-900">Geography</option>
                  <option value="Psychology" className="bg-slate-900">Psychology</option>
                  <option value="Philosophy" className="bg-slate-900">Philosophy</option>
                </optgroup>
                <optgroup label="Literature" className="bg-slate-900">
                  <option value="English Literature" className="bg-slate-900">English Literature</option>
                  <option value="Urdu Literature" className="bg-slate-900">Urdu Literature</option>
                  <option value="Hindi Literature" className="bg-slate-900">Hindi Literature</option>
                  <option value="Persian Literature" className="bg-slate-900">Persian Literature</option>
                  <option value="Arabic Literature" className="bg-slate-900">Arabic Literature</option>
                  <option value="Kashmiri Literature" className="bg-slate-900">Kashmiri Literature</option>
                </optgroup>
                <optgroup label="Other" className="bg-slate-900">
                  <option value="General" className="bg-slate-900">General / Other</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="excellent" className="bg-slate-900">Excellent</option>
                <option value="good" className="bg-slate-900">Good</option>
                <option value="fair" className="bg-slate-900">Fair</option>
                <option value="poor" className="bg-slate-900">Poor</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">I want to</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="donate" checked={listingType === 'donate'} onChange={(e) => setListingType(e.target.value)} className="accent-teal-500" />
                  <span className="text-white">Donate</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="lend" checked={listingType === 'lend'} onChange={(e) => setListingType(e.target.value)} className="accent-teal-500" />
                  <span className="text-white">Lend</span>
                </label>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors">
              {loading ? 'Adding...' : 'Add Book'}
            </button>

            {message && (
              <p className={`text-sm text-center ${message.includes('success') ? 'text-teal-400' : 'text-red-400'}`}>
                {message}
              </p>
            )}
          </form>
        </div>

        {/* ── RIGHT: My Books List ── */}
        <div>
          <h2 className="text-xl font-semibold mb-6">Your Listed Books</h2>

          {myBooks.length === 0 && (
            <div className="text-center py-10 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
              <p className="text-slate-500">You haven't added any books yet.</p>
            </div>
          )}

          <div className="space-y-3">
            {myBooks.map((book) => (
              <div key={book.id}>
                {/* Book row */}
                <div className={`bg-white/[0.03] border rounded-xl p-4 flex gap-4 items-center transition-colors ${
                  editingBookId === book.id ? 'border-teal-500/30' : 'border-white/[0.06]'
                }`}>
                  {/* Thumbnail */}
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0 border border-white/5">
                    {book.cover_url ? (
                      <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600 text-lg font-bold">
                        {book.title[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{book.title}</h3>
                    {book.author && <p className="text-sm text-slate-400 truncate">by {book.author}</p>}
                    {book.genre && <p className="text-xs text-teal-400 mt-0.5">{book.genre}</p>}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      book.status === 'available'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    }`}>
                      {book.status}
                    </span>

                    {/* Edit / Delete buttons */}
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
                        {confirmDeleteId === book.id ? (
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
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Inline edit panel */}
                {editingBookId === book.id && (
                  <div className="mt-1 bg-white/[0.02] border border-teal-500/20 border-t-0 rounded-b-xl px-5 pb-5 pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
                        <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Author</label>
                        <input type="text" value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                        <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                          <option value="available" className="bg-slate-900">Available</option>
                          <option value="unavailable" className="bg-slate-900">Unavailable</option>
                          <option value="given" className="bg-slate-900">Given Away</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                        <select value={editGenre} onChange={(e) => setEditGenre(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                          <optgroup label="Natural Sciences" className="bg-slate-900">
                            <option value="Physics" className="bg-slate-900">Physics</option>
                            <option value="Chemistry" className="bg-slate-900">Chemistry</option>
                            <option value="Biology" className="bg-slate-900">Biology</option>
                            <option value="Mathematics" className="bg-slate-900">Mathematics</option>
                          </optgroup>
                          <optgroup label="Engineering" className="bg-slate-900">
                            <option value="Civil Engineering" className="bg-slate-900">Civil Engineering</option>
                            <option value="Mechanical Engineering" className="bg-slate-900">Mechanical Engineering</option>
                            <option value="Electrical Engineering" className="bg-slate-900">Electrical Engineering</option>
                            <option value="IT/Computer Science" className="bg-slate-900">IT/Computer Science</option>
                          </optgroup>
                          <optgroup label="Medicine" className="bg-slate-900">
                            <option value="Anatomy" className="bg-slate-900">Anatomy</option>
                            <option value="Physiology" className="bg-slate-900">Physiology</option>
                            <option value="Clinical Medicine" className="bg-slate-900">Clinical Medicine</option>
                          </optgroup>
                          <optgroup label="Social Sciences" className="bg-slate-900">
                            <option value="History" className="bg-slate-900">History</option>
                            <option value="Civics" className="bg-slate-900">Civics</option>
                            <option value="Geography" className="bg-slate-900">Geography</option>
                            <option value="Psychology" className="bg-slate-900">Psychology</option>
                            <option value="Philosophy" className="bg-slate-900">Philosophy</option>
                          </optgroup>
                          <optgroup label="Literature" className="bg-slate-900">
                            <option value="English Literature" className="bg-slate-900">English Literature</option>
                            <option value="Urdu Literature" className="bg-slate-900">Urdu Literature</option>
                            <option value="Hindi Literature" className="bg-slate-900">Hindi Literature</option>
                            <option value="Persian Literature" className="bg-slate-900">Persian Literature</option>
                            <option value="Arabic Literature" className="bg-slate-900">Arabic Literature</option>
                            <option value="Kashmiri Literature" className="bg-slate-900">Kashmiri Literature</option>
                          </optgroup>
                          <optgroup label="Other" className="bg-slate-900">
                            <option value="General" className="bg-slate-900">General / Other</option>
                          </optgroup>
                        </select>
                      </div>
                    </div>

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
                        className="bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors">
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
      </div>
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
  return preview ? (
    <div className="relative inline-block">
      <img src={preview} alt="Cover preview"
        className="h-32 rounded-xl object-cover border border-white/10"
        onError={onClear} />
      <button type="button" onClick={onClear}
        className="absolute -top-2 -right-2 w-6 h-6 bg-slate-700 hover:bg-red-500 border border-white/10 rounded-full text-white text-xs flex items-center justify-center transition-colors">
        ✕
      </button>
    </div>
  ) : (
    <>
      <label className="flex flex-col items-center gap-2 border-2 border-dashed border-white/10 hover:border-teal-500/40 rounded-xl p-5 cursor-pointer transition-colors group">
        <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 group-hover:text-teal-500 transition-colors">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>
        </svg>
        <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Upload a photo</span>
        <span className="text-xs text-slate-600">JPG, PNG, WebP — max 5MB</span>
      </label>
      <div className="flex items-center gap-3 my-3">
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-xs text-slate-600">or paste a URL</span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
      <input type="url" value={urlValue} onChange={(e) => onUrlChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        placeholder="https://..." />
    </>
  )
}
