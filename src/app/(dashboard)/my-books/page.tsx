"use client"

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MyBooksPage() {
  const supabase = createClient()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [condition, setCondition] = useState('good')
  const [listingType, setListingType] = useState('donate')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    // Get the current logged-in user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setMessage('You must be logged in to add a book')
      setLoading(false)
      return
    }

    // Insert the book into the database
    const { error } = await supabase.from('books').insert({
      title,
      author,
      condition,
      listing_type: listingType,
      owner_id: user.id,
    })

    if (error) {
      setMessage('Error adding book: ' + error.message)
    } else {
      setMessage('Book added successfully!')
      setTitle('')
      setAuthor('')
    }
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">My Books</h1>
      <p className="text-slate-400 mb-8">Add a book to donate or lend</p>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 max-w-lg">
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
                <input
                  type="radio"
                  value="donate"
                  checked={listingType === 'donate'}
                  onChange={(e) => setListingType(e.target.value)}
                  className="accent-teal-500"
                />
                <span className="text-white">Donate</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="lend"
                  checked={listingType === 'lend'}
                  onChange={(e) => setListingType(e.target.value)}
                  className="accent-teal-500"
                />
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
    </div>
  )
}