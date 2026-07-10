'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { hideBook, unhideBook, editBook, bulkHideBooks } from '@/lib/admin-actions'

type Book = {
  id: string
  title: string
  author: string | null
  genre: string | null
  condition: string | null
  listing_type: string
  status: string
  hidden_by_admin: boolean
  admin_hide_reason: string | null
  created_at: string
  cover_url: string | null
  owner_id: string
  owner_name: string | null
}

export default function AdminBooksPage() {
  const supabase = createClient()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'hidden' | 'available' | 'unavailable'>('all')
  const [filterGenre, setFilterGenre] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editGenre, setEditGenre] = useState('')
  const [hideModal, setHideModal] = useState<string | null>(null)
  const [hideReason, setHideReason] = useState('')
  const [bulkHideReason, setBulkHideReason] = useState('')
  const [bulkModal, setBulkModal] = useState(false)
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)
  const [genres, setGenres] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const loadGenres = useCallback(async () => {
    const { data } = await supabase.from('genres').select('name').eq('active', true).order('display_order')
    if (data) setGenres(data.map(g => g.name))
  }, [supabase])

  useAsyncEffect(() => loadGenres(), [loadGenres])

  useEffect(() => {
    const t = setTimeout(() => { loadBooks() }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, filterGenre, search, page])

  async function loadBooks() {
    setLoading(true)

    const term = search.trim().replace(/[,()%]/g, '')

    let ownerIds: string[] = []
    if (term) {
      const { data: matchingOwners } = await supabase
        .from('profiles')
        .select('id')
        .ilike('display_name', `%${term}%`)
      ownerIds = (matchingOwners || []).map(p => p.id)
    }

    let query = supabase
      .from('books')
      .select('id, title, author, genre, condition, listing_type, status, hidden_by_admin, admin_hide_reason, created_at, cover_url, owner_id')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filter === 'hidden') query = query.eq('hidden_by_admin', true)
    if (filter === 'available') query = query.eq('status', 'available')
    if (filter === 'unavailable') query = query.eq('status', 'unavailable')
    if (filterGenre) query = query.eq('genre', filterGenre)

    if (term) {
      const ownerClause = ownerIds.length > 0 ? `,owner_id.in.(${ownerIds.join(',')})` : ''
      query = query.or(`title.ilike.%${term}%,author.ilike.%${term}%${ownerClause}`)
    }

    const { data: booksData } = await query
    if (!booksData || booksData.length === 0) { setBooks([]); setLoading(false); return }

    const bookOwnerIds = [...new Set(booksData.map(b => b.owner_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', bookOwnerIds)

    const profileMap = new Map((profiles || []).map(p => [p.id, p.display_name]))
    setBooks(booksData.map(b => ({ ...b, owner_name: profileMap.get(b.owner_id) || null })))
    setLoading(false)
  }

  const filteredBooks = books

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filteredBooks.length) setSelected(new Set())
    else setSelected(new Set(filteredBooks.map(b => b.id)))
  }

  async function handleHide(bookId: string) {
    if (!hideReason.trim()) return
    setActing(true)
    const res = await hideBook(bookId, hideReason)
    setActing(false)
    if (res.success) { setMsg('Book hidden'); setHideModal(null); setHideReason(''); loadBooks() }
    else setMsg(res.error || 'Failed')
  }

  async function handleUnhide(bookId: string) {
    setActing(true)
    const res = await unhideBook(bookId)
    setActing(false)
    if (res.success) { setMsg('Book restored'); loadBooks() }
  }

  async function handleBulkHide() {
    if (selected.size === 0 || !bulkHideReason.trim()) return
    setActing(true)
    const res = await bulkHideBooks(Array.from(selected), bulkHideReason)
    setActing(false)
    if (res.success) { setMsg(`${selected.size} books hidden`); setBulkModal(false); setBulkHideReason(''); setSelected(new Set()); loadBooks() }
    else setMsg(res.error || 'Failed')
  }

  async function handleEdit() {
    if (!editingBook) return
    setActing(true)
    const res = await editBook(editingBook.id, {
      title: editTitle.trim() || undefined,
      author: editAuthor.trim() || undefined,
      genre: editGenre || undefined,
    })
    setActing(false)
    if (res.success) { setMsg('Book updated'); setEditingBook(null); loadBooks() }
    else setMsg(res.error || 'Failed')
  }

  function openEdit(book: Book) {
    setEditingBook(book)
    setEditTitle(book.title)
    setEditAuthor(book.author || '')
    setEditGenre(book.genre || '')
  }

  return (
    <div>
      {msg && (
        <div className="mb-4 bg-brand-teal/10 border border-brand-teal/20 text-brand-teal-light text-sm px-4 py-2 rounded-lg flex justify-between">
          {msg}
          <button onClick={() => setMsg('')} className="text-brand-teal-light/50 hover:text-brand-teal-light">×</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search books or owners..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
        <select
          value={filterGenre}
          onChange={e => { setFilterGenre(e.target.value); setPage(0) }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          <option value="">All Genres</option>
          {genres.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <div className="flex gap-1">
          {(['all', 'available', 'hidden', 'unavailable'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0) }}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="mb-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center gap-3">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button onClick={() => setBulkModal(true)} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors">Hide Selected</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:text-white">Clear</button>
        </div>
      )}

      {/* Book table */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-slate-500 py-8 text-center">Loading books...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-white/5">
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={selected.size === filteredBooks.length && filteredBooks.length > 0} onChange={toggleSelectAll} className="rounded" />
                  </th>
                  <th className="p-3 font-medium">Title</th>
                  <th className="p-3 font-medium hidden md:table-cell">Author</th>
                  <th className="p-3 font-medium hidden lg:table-cell">Genre</th>
                  <th className="p-3 font-medium hidden lg:table-cell">Owner</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map(b => (
                  <tr key={b.id} className={`border-b border-white/[0.03] hover:bg-white/[0.02] ${b.hidden_by_admin ? 'opacity-60' : ''}`}>
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} className="rounded" />
                    </td>
                    <td className="p-3">
                      <p className="text-white font-medium truncate max-w-48">{b.title}</p>
                      <p className="text-xs text-slate-500">{b.listing_type} · {b.condition}</p>
                    </td>
                    <td className="p-3 text-slate-400 hidden md:table-cell">{b.author || '—'}</td>
                    <td className="p-3 text-slate-400 hidden lg:table-cell">{b.genre || '—'}</td>
                    <td className="p-3 text-slate-400 hidden lg:table-cell">{b.owner_name || '—'}</td>
                    <td className="p-3">
                      {b.hidden_by_admin ? (
                        <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Hidden</span>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          b.status === 'available' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-white/5 text-slate-400 border border-white/10'
                        }`}>{b.status}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(b)} className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors">Edit</button>
                        {b.hidden_by_admin ? (
                          <button onClick={() => handleUnhide(b.id)} disabled={acting} className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-500/10 transition-colors disabled:opacity-50">Restore</button>
                        ) : (
                          <button onClick={() => setHideModal(b.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors">Hide</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex gap-2 mt-4 justify-center">
        <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="text-sm text-slate-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">← Prev</button>
        <span className="text-sm text-slate-500 py-1.5">Page {page + 1}</span>
        <button onClick={() => setPage(page + 1)} disabled={filteredBooks.length < PAGE_SIZE} className="text-sm text-slate-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">Next →</button>
      </div>

      {/* Hide Modal */}
      {hideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setHideModal(null)}>
          <div className="bg-brand-slate border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Hide Book</h3>
            <textarea
              value={hideReason}
              onChange={e => setHideReason(e.target.value)}
              placeholder="Reason for hiding..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setHideModal(null)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-lg text-sm hover:bg-white/10">Cancel</button>
              <button onClick={() => handleHide(hideModal)} disabled={!hideReason.trim() || acting} className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm hover:bg-red-400 disabled:opacity-50">
                {acting ? 'Hiding...' : 'Hide Book'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Hide Modal */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setBulkModal(false)}>
          <div className="bg-brand-slate border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Bulk Hide {selected.size} Books</h3>
            <textarea
              value={bulkHideReason}
              onChange={e => setBulkHideReason(e.target.value)}
              placeholder="Reason for hiding..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setBulkModal(false)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-lg text-sm hover:bg-white/10">Cancel</button>
              <button onClick={handleBulkHide} disabled={!bulkHideReason.trim() || acting} className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm hover:bg-red-400 disabled:opacity-50">
                {acting ? 'Hiding...' : 'Hide All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingBook(null)}>
          <div className="bg-brand-slate border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Edit Book</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-sm text-slate-400">Title</label>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              </div>
              <div>
                <label className="text-sm text-slate-400">Author</label>
                <input type="text" value={editAuthor} onChange={e => setEditAuthor(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              </div>
              <div>
                <label className="text-sm text-slate-400">Genre</label>
                <select value={editGenre} onChange={e => setEditGenre(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-brand-teal">
                  <option value="">Select Genre</option>
                  {genres.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingBook(null)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-lg text-sm hover:bg-white/10">Cancel</button>
              <button onClick={handleEdit} disabled={acting} className="flex-1 bg-brand-teal text-white py-2 rounded-lg text-sm hover:bg-brand-teal-light disabled:opacity-50">
                {acting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
