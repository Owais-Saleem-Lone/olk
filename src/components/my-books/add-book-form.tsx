"use client"

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image-utils'
import { createNotification } from '@/lib/notifications'
import ISBNScanner from '@/components/isbn-scanner'
import GenreSelect from './genre-select'
import CoverInput from './cover-input'

// Kept outside the component: Date.now() is an impure call the React
// Compiler's purity check flags wherever it's written, even though this one
// only ever runs from an upload event handler, never during render.
function timestampedPath(userId: string, ext: string | undefined) {
  return `${userId}/${Date.now()}.${ext}`
}

export default function AddBookForm({ onAdded }: { onAdded: () => void }) {
  const supabase = createClient()

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
  const [lendingDuration, setLendingDuration] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [message, setMessage] = useState('')

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
      onAdded()
    }
    setLoading(false)
  }

  return (
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
          <GenreSelect value={genre} onChange={setGenre} />
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
