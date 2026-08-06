'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { wordCount } from '@/lib/text-limits'
import { approveClubRequest, rejectClubRequest, markClubRequestIdentityVerified, getClubRequesterEmail } from '@/lib/admin-actions'
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
  identity_verified: boolean
  identity_verified_at: string | null
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

  const [requesterEmail, setRequesterEmail] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('club_requests')
      .select('id, requester_id, name, interests, description, goal, target_members, area_name, cover_url, status, review_note, created_club_id, created_at, identity_verified, identity_verified_at, requester:requester_id(display_name, created_at)')
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
    setRequesterEmail(null)

    setEmailLoading(true)
    getClubRequesterEmail(request.id).then(res => {
      setRequesterEmail(res.email)
      setEmailLoading(false)
    })

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
    if (!selected || acting || noteOverLimit || !selected.identity_verified) return
    setActing(true)
    const res = await approveClubRequest(selected.id, note.trim())
    setActing(false)
    if (res.success) { setMsg(`"${selected.name}" approved and created`); setSelected(null); loadRequests() }
    else setMsg(res.error || 'Failed')
  }

  async function handleVerifyIdentity() {
    if (!selected || verifying) return
    setVerifying(true)
    const res = await markClubRequestIdentityVerified(selected.id)
    setVerifying(false)
    if (res.success) {
      setSelected(prev => prev ? { ...prev, identity_verified: true, identity_verified_at: new Date().toISOString() } : prev)
      loadRequests()
    } else {
      setMsg(res.error || 'Failed to mark identity verified')
    }
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
        <div className="mb-4 bg-brand-teal/10 border border-brand-teal/20 text-brand-teal-dark text-sm px-4 py-2 rounded-lg flex justify-between">
          {msg}<button onClick={() => setMsg('')} className="text-brand-teal-dark/50 hover:text-brand-teal-dark">×</button>
        </div>
      )}

      <div className="flex gap-1 mb-4">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-slate-50 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
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
                className={`w-full text-left bg-white border rounded-xl p-4 transition-colors ${
                  selected?.id === r.id ? 'border-brand-teal/30 bg-brand-teal/5' : 'border-black/5 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {r.name}
                      {r.status !== 'pending' && (
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full border ${
                          r.status === 'approved'
                            ? 'text-green-600 bg-green-500/10 border-green-500/20'
                            : 'text-red-600 bg-red-500/10 border-red-500/20'
                        }`}>{r.status}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.requester?.display_name || 'Unknown'} · {new Date(r.created_at).toLocaleDateString()} · {r.interests.join(', ') || 'General'}
                    </p>
                  </div>
                  <span className="text-slate-400 text-xs">→</span>
                </div>
              </button>
            ))
          )}
        </div>

        {selected && (
          <div className="flex-1 min-w-0 space-y-4">
            <div className="bg-white border border-black/5 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{selected.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    by {selected.requester?.display_name || 'Unknown'} · submitted {new Date(selected.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-900 text-lg">×</button>
              </div>

              {selected.cover_url && (
                <div className="relative w-full h-32 rounded-lg overflow-hidden mb-4">
                  <Image src={selected.cover_url} alt={selected.name} fill unoptimized className="object-cover" referrerPolicy="no-referrer" />
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mb-4">
                {selected.interests.map(i => (
                  <span key={i} className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">{i}</span>
                ))}
                {selected.area_name && <span className="text-xs text-slate-500">📍 {selected.area_name}</span>}
              </div>

              <div className="space-y-3 text-sm mb-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{selected.description}</p>
                </div>
                {selected.goal && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Goal</p>
                    <p className="text-slate-700 whitespace-pre-wrap">{selected.goal}</p>
                  </div>
                )}
                {selected.target_members && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Target Members</p>
                    <p className="text-slate-700 whitespace-pre-wrap">{selected.target_members}</p>
                  </div>
                )}
              </div>

              {/* Requester track record -- a supplementary signal, not a substitute
                  for the identity check below. Real exchange history already in
                  the system, no new infra needed for this part. */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center py-2 bg-white rounded-lg">
                  <p className="text-lg font-bold text-slate-900">{trackRecord ? trackRecord.completedExchanges : '…'}</p>
                  <p className="text-xs text-slate-500">Completed exchanges</p>
                </div>
                <div className="text-center py-2 bg-white rounded-lg">
                  <p className={`text-lg font-bold ${trackRecord && trackRecord.reportCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                    {trackRecord ? trackRecord.reportCount : '…'}
                  </p>
                  <p className="text-xs text-slate-500">Reports against them</p>
                </div>
                <div className="text-center py-2 bg-white rounded-lg">
                  <p className="text-sm text-slate-700">
                    {selected.requester?.created_at ? new Date(selected.requester.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}
                  </p>
                  <p className="text-xs text-slate-500">Member since</p>
                </div>
              </div>

              {selected.status === 'pending' && (
                <div className={`rounded-lg p-3 mb-4 border ${selected.identity_verified ? 'bg-brand-teal/5 border-brand-teal/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                  <p className="text-xs font-medium text-slate-700 mb-1">Identity verification</p>
                  {selected.identity_verified ? (
                    <p className="text-xs text-brand-teal-dark">
                      ✓ Verified{selected.identity_verified_at ? ` on ${new Date(selected.identity_verified_at).toLocaleDateString()}` : ''}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-600 mb-2">
                        Email {emailLoading ? '…' : (requesterEmail || 'unavailable')} to request a copy of their ID and CV before approving.
                        Only mark this once you&apos;ve reviewed both and confirmed they&apos;re a credible fit to run this club.
                      </p>
                      <button onClick={handleVerifyIdentity} disabled={verifying}
                        className="text-xs bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                        {verifying ? 'Marking...' : 'Mark Identity Verified'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {selected.status === 'pending' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs text-slate-600">Review note (shown to the requester)</label>
                    <span className={`text-xs ${noteOverLimit ? 'text-red-600' : 'text-slate-400'}`}>{noteWords}/100 words</span>
                  </div>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                    className={`w-full bg-slate-100 border rounded-lg px-3 py-2 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none mb-3 ${noteOverLimit ? 'border-red-500/50' : 'border-slate-200'}`}
                    placeholder="Optional note — required if rejecting, so they know what to fix" />
                  <div className="flex gap-2">
                    <button onClick={handleApprove} disabled={acting || noteOverLimit || !selected.identity_verified}
                      title={!selected.identity_verified ? 'Verify identity before approving' : undefined}
                      className="flex-1 bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                      {acting ? 'Working...' : 'Approve'}
                    </button>
                    <button onClick={handleReject} disabled={acting || noteOverLimit}
                      className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 font-semibold py-2 rounded-lg text-sm transition-colors">
                      {acting ? 'Working...' : 'Reject'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-600 bg-white rounded-lg p-3">
                  <p className="font-medium text-slate-700 mb-1">{selected.status === 'approved' ? 'Approved' : 'Rejected'}</p>
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
