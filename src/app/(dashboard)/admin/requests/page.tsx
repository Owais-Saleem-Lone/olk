'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { cancelRequest, forceReturnBook } from '@/lib/admin-actions'

type Request = {
  id: string
  status: string
  created_at: string
  handed_over_at: string | null
  completed_at: string | null
  requester_id: string
  book_id: string
  requester_name: string | null
  book_title: string | null
  book_listing_type: string | null
  owner_name: string | null
}

type Overdue = {
  request_id: string
  book_title: string
  book_author: string | null
  owner_name: string | null
  borrower_name: string | null
  handed_over_at: string
  days_overdue: number
}

export default function AdminRequestsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<Request[]>([])
  const [overdue, setOverdue] = useState<Overdue[]>([])
  const [tab, setTab] = useState<'all' | 'overdue'>('all')
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [cancelModal, setCancelModal] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const loadRequests = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('book_requests')
      .select('id, status, created_at, handed_over_at, completed_at, requester_id, book_id')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filter !== 'all') query = query.eq('status', filter)
    const { data: reqData } = await query
    if (!reqData || reqData.length === 0) { setRequests([]); setLoading(false); return }

    const bookIds = [...new Set(reqData.map(r => r.book_id))]
    const requesterIds = [...new Set(reqData.map(r => r.requester_id))]

    const [{ data: booksData }, { data: profilesData }] = await Promise.all([
      supabase.from('books').select('id, title, listing_type, owner_id').in('id', bookIds),
      supabase.from('profiles').select('id, display_name').in('id', requesterIds),
    ])

    const bookMap = new Map((booksData || []).map(b => [b.id, b]))
    const profileMap = new Map((profilesData || []).map(p => [p.id, p.display_name]))

    const ownerIds = [...new Set((booksData || []).map(b => b.owner_id))]
    const { data: ownerProfiles } = await supabase.from('profiles').select('id, display_name').in('id', ownerIds)
    const ownerMap = new Map((ownerProfiles || []).map(p => [p.id, p.display_name]))

    setRequests(reqData.map(r => {
      const book = bookMap.get(r.book_id)
      return {
        ...r,
        requester_name: profileMap.get(r.requester_id) || null,
        book_title: book?.title || null,
        book_listing_type: book?.listing_type || null,
        owner_name: book ? (ownerMap.get(book.owner_id) || null) : null,
      }
    }))
    setLoading(false)
  }, [supabase, filter, page])

  const loadOverdue = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('admin_get_overdue_books', { threshold_days: 14 })
    setOverdue((data || []) as unknown as Overdue[])
    setLoading(false)
  }, [supabase])

  useAsyncEffect(() => {
    if (tab === 'all') loadRequests(); else loadOverdue()
  }, [tab, loadRequests, loadOverdue])

  async function handleCancel(requestId: string) {
    if (!cancelReason.trim()) return
    setActing(true)
    const res = await cancelRequest(requestId, cancelReason)
    setActing(false)
    if (res.success) { setMsg('Request cancelled'); setCancelModal(null); setCancelReason(''); loadRequests() }
    else setMsg(res.error || 'Failed')
  }

  async function handleForceReturn(requestId: string) {
    setActing(true)
    const res = await forceReturnBook(requestId)
    setActing(false)
    if (res.success) { setMsg('Book marked as returned'); loadOverdue() }
    else setMsg(res.error || 'Failed')
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    accepted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    declined: 'bg-red-500/10 text-red-400 border-red-500/20',
    handed_over: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    returned: 'bg-green-500/10 text-green-400 border-green-500/20',
  }

  return (
    <div>
      {msg && (
        <div className="mb-4 bg-brand-teal/10 border border-brand-teal/20 text-brand-teal-light text-sm px-4 py-2 rounded-lg flex justify-between">
          {msg}<button onClick={() => setMsg('')} className="text-brand-teal-light/50 hover:text-brand-teal-light">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'overdue'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(0) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            {t === 'all' ? 'All Requests' : `Overdue Books ${overdue.length > 0 ? `(${overdue.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Filters (only for All tab) */}
      {tab === 'all' && (
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {['all', 'pending', 'accepted', 'handed_over', 'declined', 'returned'].map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      )}

      {tab === 'all' ? (
        <>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            {loading ? (
              <p className="text-slate-500 py-8 text-center">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-white/5">
                      <th className="p-3 font-medium">Book</th>
                      <th className="p-3 font-medium hidden md:table-cell">Owner</th>
                      <th className="p-3 font-medium hidden md:table-cell">Requester</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium hidden lg:table-cell">Date</th>
                      <th className="p-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(r => {
                      return (
                        <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="p-3">
                            <p className="text-white truncate max-w-48">{r.book_title || 'Deleted'}</p>
                            <p className="text-xs text-slate-500">{r.book_listing_type}</p>
                          </td>
                          <td className="p-3 text-slate-400 hidden md:table-cell">{r.owner_name || '—'}</td>
                          <td className="p-3 text-slate-400 hidden md:table-cell">{r.requester_name || '—'}</td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor[r.status] || 'bg-white/5 text-slate-400 border-white/10'}`}>
                              {r.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 text-xs hidden lg:table-cell">{new Date(r.created_at).toLocaleDateString()}</td>
                          <td className="p-3 text-right">
                            {(r.status === 'pending' || r.status === 'accepted' || r.status === 'handed_over') && (
                              <div className="flex gap-1 justify-end">
                                {r.status === 'handed_over' && (
                                  <button onClick={() => handleForceReturn(r.id)} disabled={acting} className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-500/10 transition-colors disabled:opacity-50">Force Return</button>
                                )}
                                <button onClick={() => setCancelModal(r.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors">Cancel</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4 justify-center">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="text-sm text-slate-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-white/5">← Prev</button>
            <span className="text-sm text-slate-500 py-1.5">Page {page + 1}</span>
            <button onClick={() => setPage(page + 1)} disabled={requests.length < PAGE_SIZE} className="text-sm text-slate-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-white/5">Next →</button>
          </div>
        </>
      ) : (
        /* Overdue tab */
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
          {loading ? (
            <p className="text-slate-500 py-8 text-center">Loading...</p>
          ) : overdue.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No overdue books</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-white/5">
                    <th className="p-3 font-medium">Book</th>
                    <th className="p-3 font-medium">Owner</th>
                    <th className="p-3 font-medium">Borrower</th>
                    <th className="p-3 font-medium">Handed Over</th>
                    <th className="p-3 font-medium">Days Overdue</th>
                    <th className="p-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map(o => (
                    <tr key={o.request_id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="p-3 text-white">{o.book_title}</td>
                      <td className="p-3 text-slate-400">{o.owner_name || '—'}</td>
                      <td className="p-3 text-slate-400">{o.borrower_name || '—'}</td>
                      <td className="p-3 text-slate-500 text-xs">{new Date(o.handed_over_at).toLocaleDateString()}</td>
                      <td className="p-3">
                        <span className={`text-sm font-semibold ${o.days_overdue > 60 ? 'text-red-400' : o.days_overdue > 30 ? 'text-orange-400' : 'text-amber-400'}`}>
                          {o.days_overdue}d
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => handleForceReturn(o.request_id)} disabled={acting} className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-500/10 transition-colors disabled:opacity-50">Force Return</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setCancelModal(null)}>
          <div className="bg-brand-slate border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Cancel Request</h3>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setCancelModal(null)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-lg text-sm hover:bg-white/10">Cancel</button>
              <button onClick={() => handleCancel(cancelModal)} disabled={!cancelReason.trim() || acting} className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm hover:bg-red-400 disabled:opacity-50">
                {acting ? 'Cancelling...' : 'Cancel Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
