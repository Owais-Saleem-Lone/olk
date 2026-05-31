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
}

export default function MyBooksPage() {
  const supabase = createClient()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [condition, setCondition] = useState('good')
  const [listingType, setListingType] = useState('donate')
  const [genre, setGenre] = useState('General')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [myBooks, setMyBooks] = useState<Book[]>([])

  useEffect(() => {
    fetchMyBooks()
  }, [])

  const fetchMyBooks = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('books')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setMyBooks(data)
    }
  }

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setMessage('You must be logged in to add a book')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('books').insert({
      title,
      author,
      condition,
      listing_type: listingType,
      genre: genre,
      owner_id: user.id,
    })

    if (error) {
      setMessage('Error adding book: ' + error.message)
    } else {
      setMessage('Book added successfully!')
      setTitle('')
      setAuthor('')
      setGenre('General')
      fetchMyBooks()
    }
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">My Books</h1>
      <p className="text-slate-400 mb-8">Add a book to donate or lend</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* LEFT SIDE: Add Book Form */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-6">Add a New Book</h2>
          <form onSubmit={handleAddBook} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Book Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g., The Alchemist"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Author</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g., Paulo Coelho"
              />
            </div>

            {/* NEW: Category / Genre Dropdown */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
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
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Adding...' : 'Add Book'}
            </button>

            {message && (
              <p className={`text-sm text-center ${message.includes('success') ? 'text-teal-400' : 'text-red-400'}`}>
                {message}
              </p>
            )}
          </form>
        </div>

        {/* RIGHT SIDE: My Books List */}
        <div>
          <h2 className="text-xl font-semibold mb-6">Your Listed Books</h2>
          
          {myBooks.length === 0 && (
            <div className="text-center py-10 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
              <p className="text-slate-500">You haven't added any books yet.</p>
            </div>
          )}

          <div className="space-y-4">
            {myBooks.map((book) => (
              <div key={book.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-white">{book.title}</h3>
                  {book.author && <p className="text-sm text-slate-400">by {book.author}</p>}
                  {book.genre && <p className="text-xs text-teal-400 mt-1">{book.genre}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    book.listing_type === 'donate' 
                      ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' 
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  }`}>
                    {book.listing_type === 'donate' ? '🎁 Donate' : '🤝 Lend'}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    book.status === 'available' 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                      : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                  }`}>
                    {book.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}