'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { wordCount } from '@/lib/text-limits'
import { approveClubRequest, rejectClubRequest } from '@/lib/admin-actions'
import Image from 'next/image'

type ClubRequest = {
  id: string
  requester_id: string
  name: string
  interests: string[]
  description: string
  goal: string | null
  target_members: string | null
  area_name: string | null
  cover_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  review_note: string | null
  created_club_id: string | null
  created_at: string
  requester: { display_name: string | null; created_at: string } | null
}

type TrackRecord = {
  completedExchanges: number
  reportCount: number
}

export default function AdminClubRequestsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<ClubRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [selected, setSelected] = useState<ClubRequest | null>(null)
  const [trackRecord, setTrackRecord] = useState<TrackRecord | null>(null)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState(false)
  const [msg, setMsg] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('club_requests')
      .select('id, requester_id, name, interests, description, goal, target_members, area_name, cover_url, status, review_note, created_club_id, created_at, requester:requester_id(display_name, created_at)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)

    const { data } = await query
    setRequests((data || []) as unknown as ClubRequest[])
    setLoading(false)
  }, [supabase, filter])

  useAsyncEffect(() => loadRequests(), [loadRequests])

  async function selectRequest(request: ClubRequest) {
    setSelected(request)
    setNote('')
    setTrackRecord(null)

    const { data: myBooks } = await supabase.from('books').select('id').eq('owner_id', request.requester_id)
    const bookIds = (myBooks || []).map(b => b.id)

    let completedExchanges = 0
    if (bookIds.length > 0) {
      const { count } = await supabase
        .from('book_requests')
        .select('*', { count: 'exact', head: true })
        .in('book_id', bookIds)
        .in('status', ['handed_over', 'returned'])
      completedExchanges += count || 0
    }
    const { count: requesterExchanges } = await supabase
      .from('book_requests')
      .select('*', { count: 'exact', head: true })
      .eq('requester_id', request.requester_id)
      .in('status', ['handed_over', 'returned'])
    completedExchanges += requesterExchanges || 0

    const { count: reportCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('reported_user_id', request.requester_id)

    setTrackRecord({ completedExchanges, reportCount: reportCount || 0 })
  }

  const noteWords = wordCount(note)
  const noteOverLimit = noteWords > 100

  async function handleApprove() {
    if (!selected || acting || noteOverLimit) return
    setActing(true)
    const res = await approveClubRequest(selected.id, note.trim())
    setActing(false)
    if (res.success) { setMsg(`"${selected.name}" approved and created`); setSelected(null); loadRequests() }
    else setMsg(res.error || 'Failed')
  }

  async function handleReject() {
    if (!selected || acting || noteOverLimit) return
    setActing(true)
    const res = await rejectClubRequest(selected.id, note.trim())
    setActing(false)
    if (res.success) { setMsg(`"${selected.name}" rejected`); setSelected(null); loadRequests() }
    else setMsg(res.error || 'Failed')
  }

  return (
    <div>
      {msg && (
        <div className="mb-4 bg-brand-teal/10 border border-brand-teal/20 text-brand-teal-light text-sm px-4 py-2 rounded-lg flex justify-between">
          {msg}<button onClick={() => setMsg('')} className="text-brand-teal-light/50 hover:text-brand-teal-light">×</button>
        </div>
      )}

      <div className="flex gap-1 mb-4">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
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

      <div className="flex gap-4">
        <div className={`${selected ? 'hidden md:block md:w-2/5' : 'w-full'} space-y-2`}>
          {loading ? (
            <p className="text-slate-500 py-8 text-center">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No requests found</p>
          ) : (
            requests.map(r => (
              <button
                key={r.id}
                onClick={() => selectRequest(r)}
                className={`w-full text-left bg-white/[0.03] border rounded-xl p-4 transition-colors ${
                  selected?.id === r.id ? 'border-brand-teal/30 bg-brand-teal/5' : 'border-white/[0.06] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {r.name}
                      {r.status !== 'pending' && (
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full border ${
                          r.status === 'approved'
                            ? 'text-green-400 bg-green-500/10 border-green-500/20'
                            : 'text-red-400 bg-red-500/10 border-red-500/20'
                        }`}>{r.status}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.requester?.display_name || 'Unknown'} · {new Date(r.created_at).toLocaleDateString()} · {r.interests.join(', ') || 'General'}
                    </p>
                  </div>
                  <span className="text-slate-600 text-xs">→</span>
                </div>
              </button>
            ))
          )}
        </div>

        {selected && (
          <div className="flex-1 min-w-0 space-y-4">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selected.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    by {selected.requester?.display_name || 'Unknown'} · submitted {new Date(selected.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-lg">×</button>
              </div>

              {selected.cover_url && (
                <div className="relative w-full h-32 rounded-lg overflow-hidden mb-4">
                  <Image src={selected.cover_url} alt={selected.name} fill unoptimized className="object-cover" referrerPolicy="no-referrer" />
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mb-4">
                {selected.interests.map(i => (
                  <span key={i} className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">{i}</span>
                ))}
                {selected.area_name && <span className="text-xs text-slate-500">📍 {selected.area_name}</span>}
              </div>

              <div className="space-y-3 text-sm mb-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <p className="text-slate-300 whitespace-pre-wrap">{selected.description}</p>
                </div>
                {selected.goal && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Goal</p>
                    <p className="text-slate-300 whitespace-pre-wrap">{selected.goal}</p>
                  </div>
                )}
                {selected.target_members && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Target Members</p>
                    <p className="text-slate-300 whitespace-pre-wrap">{selected.target_members}</p>
                  </div>
                )}
              </div>

              {/* Requester track record -- the lightweight substitute for formal ID
                  verification: real signal already in the system, no new infra. */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center py-2 bg-white/[0.03] rounded-lg">
                  <p className="text-lg font-bold text-white">{trackRecord ? trackRecord.completedExchanges : '…'}</p>
                  <p className="text-xs text-slate-500">Completed exchanges</p>
                </div>
                <div className="text-center py-2 bg-white/[0.03] rounded-lg">
                  <p className={`text-lg font-bold ${trackRecord && trackRecord.reportCount > 0 ? 'text-red-400' : 'text-white'}`}>
                    {trackRecord ? trackRecord.reportCount : '…'}
                  </p>
                  <p className="text-xs text-slate-500">Reports against them</p>
                </div>
                <div className="text-center py-2 bg-white/[0.03] rounded-lg">
                  <p className="text-sm text-slate-300">
                    {selected.requester?.created_at ? new Date(selected.requester.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}
                  </p>
                  <p className="text-xs text-slate-500">Member since</p>
                </div>
              </div>

              {selected.status === 'pending' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs text-slate-400">Review note (shown to the requester)</label>
                    <span className={`text-xs ${noteOverLimit ? 'text-red-400' : 'text-slate-600'}`}>{noteWords}/100 words</span>
                  </div>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                    className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none mb-3 ${noteOverLimit ? 'border-red-500/50' : 'border-white/10'}`}
                    placeholder="Optional note — required if rejecting, so they know what to fix" />
                  <div className="flex gap-2">
                    <button onClick={handleApprove} disabled={acting || noteOverLimit}
                      className="flex-1 bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                      {acting ? 'Working...' : 'Approve'}
                    </button>
                    <button onClick={handleReject} disabled={acting || noteOverLimit}
                      className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-semibold py-2 rounded-lg text-sm transition-colors">
                      {acting ? 'Working...' : 'Reject'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400 bg-white/[0.02] rounded-lg p-3">
                  <p className="font-medium text-slate-300 mb-1">{selected.status === 'approved' ? 'Approved' : 'Rejected'}</p>
                  {selected.review_note && <p>Note: {selected.review_note}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
