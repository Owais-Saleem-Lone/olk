"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type WishlistItem = {
  id: string
  title: string
  author: string | null
  genre: string | null
  active: boolean
  matched_book_id: string | null
  created_at: string
}

export default function WishlistPage() {
  const supabase = createClient()
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const fetchWishlist = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('wishlists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (data) setItems(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { queueMicrotask(() => fetchWishlist()) }, [fetchWishlist])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setAdding(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAdding(false); return }

    const { error: insertError } = await supabase.from('wishlists').insert({
      user_id: user.id,
      title: title.trim(),
      author: author.trim() || null,
    })

    if (!insertError) {
      setTitle('')
      setAuthor('')
      fetchWishlist()
    } else if (insertError.code === '23505') {
      setError('That title is already on your wishlist.')
    } else {
      setError('Could not add to wishlist. Please try again.')
    }
    setAdding(false)
  }

  const handleRemove = async (id: string) => {
    await supabase.from('wishlists').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) return <p className="text-slate-400">Loading wishlist...</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Wishlist</h1>
      <p className="text-slate-400 mb-8">Books you&apos;re looking for — we&apos;ll notify you when someone lists a match</p>

      {/* Add Form */}
      <form onSubmit={handleAdd} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Book title you're looking for..."
            required
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
          />
          <input
            type="text"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="Author (optional)"
            className="sm:w-48 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
          />
          <button
            type="submit"
            disabled={adding || !title.trim()}
            className="bg-brand-teal hover:bg-brand-teal-light disabled:opacity-40 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            {adding ? 'Adding...' : '+ Add to Wishlist'}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
      </form>

      {/* Wishlist Items */}
      {items.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">✨</div>
          <p className="text-slate-500 mb-2">Your wishlist is empty</p>
          <p className="text-xs text-slate-600">Add a book you&apos;re looking for and we&apos;ll let you know when it&apos;s available nearby.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white">{item.title}</h3>
                {item.author && <p className="text-sm text-slate-400">by {item.author}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.matched_book_id ? (
                  <Link
                    href={`/browse?q=${encodeURIComponent(item.title)}`}
                    className="bg-brand-teal/10 text-brand-teal-light border border-brand-teal/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-brand-teal/20"
                  >
                    Match found! →
                  </Link>
                ) : (
                  <span className="text-xs text-slate-500 bg-white/5 px-3 py-1.5 rounded-full">Waiting...</span>
                )}
                <button
                  onClick={() => handleRemove(item.id)}
                  className="text-xs text-slate-600 hover:text-red-400 transition-colors px-2 py-1.5"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
