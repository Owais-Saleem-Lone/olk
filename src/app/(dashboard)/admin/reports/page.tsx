'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { updateReportStatus, addAdminNote, updateReportCategory, banUser, warnUser, hideBook } from '@/lib/admin-actions'

type Report = {
  id: string
  reason: string
  details: string | null
  status: string
  category: string | null
  created_at: string
  assigned_to: string | null
  resolved_at: string | null
  reporter_id: string
  reported_user_id: string | null
  reported_book_id: string | null
  reporter_name: string | null
  reported_user_name: string | null
  reported_book_title: string | null
  resolved_by_name: string | null
}

type AdminNote = {
  id: string
  content: string
  created_at: string
  admin_name: string | null
}

const CATEGORIES = ['spam', 'inappropriate', 'fake_listing', 'harassment', 'scam', 'other']

export default function AdminReportsPage() {
  const supabase = createClient()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'dismissed' | 'all'>('pending')
  const [filterCat, setFilterCat] = useState('')
  const [selected, setSelected] = useState<Report | null>(null)
  const [notes, setNotes] = useState<AdminNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)
  const [quickAction, setQuickAction] = useState<'ban' | 'warn' | 'hide' | null>(null)
  const [quickReason, setQuickReason] = useState('')
  const [quickBanDays, setQuickBanDays] = useState(7)

  const loadReports = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('reports')
      .select('id, reason, details, status, category, created_at, assigned_to, resolved_at, resolved_by, reporter_id, reported_user_id, reported_book_id')
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter !== 'all') query = query.eq('status', filter)
    if (filterCat) query = query.eq('category', filterCat)

    const { data: reportsData } = await query
    if (!reportsData || reportsData.length === 0) { setReports([]); setLoading(false); return }

    const profileIds = [...new Set([
      ...reportsData.map(r => r.reporter_id),
      ...reportsData.map(r => r.reported_user_id).filter(Boolean),
      ...reportsData.map(r => r.resolved_by).filter(Boolean),
    ] as string[])]
    const bookIds = [...new Set(reportsData.map(r => r.reported_book_id).filter(Boolean) as string[])]

    const [{ data: profiles }, { data: books }] = await Promise.all([
      profileIds.length > 0 ? supabase.from('profiles').select('id, display_name').in('id', profileIds) : { data: [] },
      bookIds.length > 0 ? supabase.from('books').select('id, title').in('id', bookIds) : { data: [] },
    ])

    const profileMap = new Map((profiles || []).map(p => [p.id, p.display_name]))
    const bookMap = new Map((books || []).map(b => [b.id, b.title]))

    setReports(reportsData.map(r => ({
      ...r,
      reporter_name: profileMap.get(r.reporter_id) || null,
      reported_user_name: r.reported_user_id ? profileMap.get(r.reported_user_id) || null : null,
      reported_book_title: r.reported_book_id ? bookMap.get(r.reported_book_id) || null : null,
      resolved_by_name: r.resolved_by ? profileMap.get(r.resolved_by) || null : null,
    })))
    setLoading(false)
  }, [supabase, filter, filterCat])

  useAsyncEffect(() => loadReports(), [loadReports])

  async function selectReport(r: Report) {
    setSelected(r)
    const { data: notesData } = await supabase
      .from('admin_notes')
      .select('id, content, created_at, admin_id')
      .eq('report_id', r.id)
      .order('created_at', { ascending: true })
    if (!notesData || notesData.length === 0) { setNotes([]); return }
    const adminIds = [...new Set(notesData.map(n => n.admin_id))]
    const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', adminIds)
    const profileMap = new Map((profiles || []).map(p => [p.id, p.display_name]))
    setNotes(notesData.map(n => ({ ...n, admin_name: profileMap.get(n.admin_id) || null })))
  }

  async function handleStatus(status: string) {
    if (!selected) return
    setActing(true)
    const res = await updateReportStatus(selected.id, status)
    setActing(false)
    if (res.success) { setMsg(`Report ${status}`); setSelected(null); loadReports() }
  }

  async function handleAddNote() {
    if (!selected || !newNote.trim()) return
    setActing(true)
    const res = await addAdminNote(selected.id, newNote)
    setActing(false)
    if (res.success) {
      setNewNote('')
      selectReport(selected)
    }
  }

  async function handleCategory(cat: string) {
    if (!selected) return
    await updateReportCategory(selected.id, cat)
    setSelected({ ...selected, category: cat })
    loadReports()
  }

  async function handleQuickAction() {
    if (!selected || !quickReason.trim()) return
    setActing(true)
    let res
    if (quickAction === 'ban' && selected.reported_user_id) {
      res = await banUser(selected.reported_user_id, quickReason, false, quickBanDays)
    } else if (quickAction === 'warn' && selected.reported_user_id) {
      res = await warnUser(selected.reported_user_id, quickReason)
    } else if (quickAction === 'hide' && selected.reported_book_id) {
      res = await hideBook(selected.reported_book_id, quickReason)
    }
    setActing(false)
    if (res?.success) {
      setMsg(`Action completed`)
      setQuickAction(null)
      setQuickReason('')
      setQuickBanDays(7)
      await updateReportStatus(selected.id, 'resolved')
      setSelected(null)
      loadReports()
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    resolved: 'bg-green-500/10 text-green-400 border-green-500/20',
    dismissed: 'bg-white/5 text-slate-400 border-white/10',
  }

  return (
    <div>
      {msg && (
        <div className="mb-4 bg-brand-teal/10 border border-brand-teal/20 text-brand-teal-light text-sm px-4 py-2 rounded-lg flex justify-between">
          {msg}<button onClick={() => setMsg('')} className="text-brand-teal-light/50 hover:text-brand-teal-light">×</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1">
          {(['pending', 'resolved', 'dismissed', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="flex gap-4">
        {/* Report list */}
        <div className={`${selected ? 'hidden md:block md:w-2/5' : 'w-full'} space-y-2`}>
          {loading ? (
            <p className="text-slate-500 py-8 text-center">Loading...</p>
          ) : reports.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No reports</p>
          ) : (
            reports.map(r => (
              <button
                key={r.id}
                onClick={() => selectReport(r)}
                className={`w-full text-left bg-white/[0.03] border rounded-xl p-4 transition-colors ${
                  selected?.id === r.id ? 'border-brand-teal/30 bg-brand-teal/5' : 'border-white/[0.06] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{r.reason}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor[r.status] || ''}`}>{r.status}</span>
                      {r.category && r.category !== 'other' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">{r.category.replace('_', ' ')}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5">
                      By {r.reporter_name || 'Unknown'} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-slate-600 text-xs">→</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Report detail */}
        {selected && (
          <div className="flex-1 min-w-0 space-y-4">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">{selected.reason}</h3>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-lg">×</button>
              </div>

              {selected.details && <p className="text-sm text-slate-400 mb-3">{selected.details}</p>}

              <div className="flex flex-wrap gap-2 mb-4 text-xs text-slate-500">
                <span>Reporter: {selected.reporter_name || 'Unknown'}</span>
                {selected.reported_user_name && <span>Against: {selected.reported_user_name}</span>}
                {selected.reported_book_title && <span>Book: {selected.reported_book_title}</span>}
                <span>{new Date(selected.created_at).toLocaleString()}</span>
              </div>

              {/* Category selector */}
              <div className="mb-4">
                <label className="text-xs text-slate-500 mb-1 block">Category</label>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      onClick={() => handleCategory(c)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        selected.category === c ? 'bg-brand-teal/10 text-brand-teal-light border-brand-teal/20' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {c.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status actions */}
              {selected.status === 'pending' && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <button onClick={() => handleStatus('resolved')} disabled={acting} className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">Resolve</button>
                  <button onClick={() => handleStatus('dismissed')} disabled={acting} className="text-xs bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">Dismiss</button>
                </div>
              )}

              {/* Quick actions */}
              <div className="border-t border-white/5 pt-4 mb-4">
                <p className="text-xs text-slate-500 mb-2">Quick Actions</p>
                <div className="flex flex-wrap gap-2">
                  {selected.reported_user_id && (
                    <>
                      <button onClick={() => setQuickAction('ban')} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors">Ban User</button>
                      <button onClick={() => setQuickAction('warn')} className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 px-3 py-1.5 rounded-lg transition-colors">Warn User</button>
                    </>
                  )}
                  {selected.reported_book_id && (
                    <button onClick={() => setQuickAction('hide')} className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg transition-colors">Hide Book</button>
                  )}
                </div>
              </div>

              {/* Resolution info */}
              {selected.resolved_at && (
                <div className="text-xs text-slate-500 border-t border-white/5 pt-3">
                  Resolved {new Date(selected.resolved_at).toLocaleString()}
                  {selected.resolved_by_name && ` by ${selected.resolved_by_name}`}
                </div>
              )}
            </div>

            {/* Admin notes */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <p className="text-sm font-medium text-slate-300 mb-3">Internal Notes</p>
              {notes.length === 0 ? (
                <p className="text-xs text-slate-600 mb-3">No notes yet</p>
              ) : (
                <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                  {notes.map(n => (
                    <div key={n.id} className="bg-white/[0.03] border border-white/[0.04] rounded-lg p-3">
                      <p className="text-sm text-slate-300">{n.content}</p>
                      <p className="text-xs text-slate-600 mt-1">{n.admin_name || 'Admin'} · {new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Add internal note..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                />
                <button onClick={handleAddNote} disabled={!newNote.trim() || acting} className="bg-brand-teal text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-teal-light disabled:opacity-50 transition-colors">Add</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Action Modal */}
      {quickAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setQuickAction(null)}>
          <div className="bg-brand-slate border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">
              {quickAction === 'ban' ? 'Ban User' : quickAction === 'warn' ? 'Warn User' : 'Hide Book'}
            </h3>
            <textarea
              value={quickReason}
              onChange={e => setQuickReason(e.target.value)}
              placeholder="Reason..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none mb-4"
            />
            {quickAction === 'ban' && (
              <div className="mb-4">
                <label className="text-sm text-slate-400">Duration (days)</label>
                <input
                  type="number"
                  value={quickBanDays}
                  onChange={e => setQuickBanDays(Number(e.target.value))}
                  min={1}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setQuickAction(null)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-lg text-sm hover:bg-white/10">Cancel</button>
              <button onClick={handleQuickAction} disabled={!quickReason.trim() || acting} className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm hover:bg-red-400 disabled:opacity-50">
                {acting ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
