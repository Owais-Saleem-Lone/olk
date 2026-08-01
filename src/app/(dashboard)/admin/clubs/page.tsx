'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { deactivateClub, reactivateClub, removeClubMember, transferClubOwnership } from '@/lib/admin-actions'

type Club = {
  id: string
  name: string
  description: string | null
  interests: string[]
  area_name: string | null
  member_count: number
  active: boolean
  created_at: string
  creator: { id: string; display_name: string | null } | null
}

type ClubMember = {
  id: string
  user_id: string
  joined_at: string
  user: { display_name: string | null } | null
}

export default function AdminClubsPage() {
  const supabase = createClient()
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [selected, setSelected] = useState<Club | null>(null)
  const [members, setMembers] = useState<ClubMember[]>([])
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)
  const [transferModal, setTransferModal] = useState(false)
  const [transferUserId, setTransferUserId] = useState('')

  const loadClubs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('clubs')
      .select('id, name, description, interests, area_name, member_count, active, created_at, creator:creator_id(id, display_name)')
      .order('member_count', { ascending: false })

    if (filter === 'active') query = query.eq('active', true)
    if (filter === 'inactive') query = query.eq('active', false)

    const { data } = await query
    setClubs((data || []) as unknown as Club[])
    setLoading(false)
  }, [supabase, filter])

  useAsyncEffect(() => loadClubs(), [loadClubs])

  async function selectClub(club: Club) {
    setSelected(club)
    const { data } = await supabase
      .from('club_members')
      .select('id, user_id, joined_at, user:user_id(display_name)')
      .eq('club_id', club.id)
      .order('joined_at', { ascending: true })
    setMembers((data || []) as unknown as ClubMember[])
  }

  async function handleToggleActive(club: Club) {
    setActing(true)
    const res = club.active ? await deactivateClub(club.id) : await reactivateClub(club.id)
    setActing(false)
    if (res.success) { setMsg(club.active ? 'Club deactivated' : 'Club reactivated'); setSelected(null); loadClubs() }
  }

  async function handleRemoveMember(memberId: string, userId: string) {
    if (!selected) return
    setActing(true)
    const res = await removeClubMember(selected.id, userId)
    setActing(false)
    if (res.success) {
      setMsg('Member removed')
      setMembers(prev => prev.filter(m => m.id !== memberId))
    }
  }

  async function handleTransfer() {
    if (!selected || !transferUserId.trim()) return
    setActing(true)
    const res = await transferClubOwnership(selected.id, transferUserId)
    setActing(false)
    if (res.success) { setMsg('Ownership transferred'); setTransferModal(false); setSelected(null); loadClubs() }
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
        {(['active', 'inactive', 'all'] as const).map(f => (
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
          ) : clubs.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No clubs found</p>
          ) : (
            clubs.map(c => (
              <button
                key={c.id}
                onClick={() => selectClub(c)}
                className={`w-full text-left bg-white border rounded-xl p-4 transition-colors ${
                  selected?.id === c.id ? 'border-brand-teal/30 bg-brand-teal/5' : 'border-black/5 hover:bg-slate-50'
                } ${!c.active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {c.name}
                      {!c.active && <span className="ml-2 text-xs text-red-600 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">Inactive</span>}
                    </p>
                    <p className="text-xs text-slate-500">{c.member_count} members · {c.area_name || 'No area'} · {c.interests.join(', ') || 'General'}</p>
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
                  {selected.description && <p className="text-sm text-slate-600 mt-1">{selected.description}</p>}
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-900 text-lg">×</button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center py-2 bg-white rounded-lg">
                  <p className="text-lg font-bold text-slate-900">{selected.member_count}</p>
                  <p className="text-xs text-slate-500">Members</p>
                </div>
                <div className="text-center py-2 bg-white rounded-lg">
                  <p className="text-sm text-slate-700">{selected.interests.join(', ') || '—'}</p>
                  <p className="text-xs text-slate-500">Interests</p>
                </div>
                <div className="text-center py-2 bg-white rounded-lg">
                  <p className="text-sm text-slate-700">{selected.area_name || '—'}</p>
                  <p className="text-xs text-slate-500">Area</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-4">
                Created by {(selected.creator as { display_name: string | null } | null)?.display_name || 'Unknown'} · {new Date(selected.created_at).toLocaleDateString()}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleToggleActive(selected)}
                  disabled={acting}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    selected.active
                      ? 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20'
                      : 'bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20'
                  }`}
                >
                  {selected.active ? 'Deactivate' : 'Reactivate'}
                </button>
                <button onClick={() => setTransferModal(true)} className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors">Transfer Ownership</button>
              </div>
            </div>

            {/* Members list */}
            <div className="bg-white border border-black/5 rounded-2xl p-5">
              <p className="text-sm font-medium text-slate-700 mb-3">Members ({members.length})</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg">
                    <div>
                      <p className="text-sm text-slate-900">{(m.user as { display_name: string | null } | null)?.display_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                    </div>
                    {m.user_id !== (selected.creator as { id: string } | null)?.id && (
                      <button
                        onClick={() => handleRemoveMember(m.id, m.user_id)}
                        disabled={acting}
                        className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setTransferModal(false)}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Transfer Club Ownership</h3>
            <p className="text-sm text-slate-600 mb-3">Choose the new owner (must be a club member).</p>
            <select
              value={transferUserId}
              onChange={e => setTransferUserId(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
            >
              <option value="">Select a member…</option>
              {members
                .filter(m => m.user_id !== (selected?.creator as { id: string } | null)?.id)
                .map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {(m.user as { display_name: string | null } | null)?.display_name || m.user_id}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setTransferModal(false)} className="flex-1 bg-slate-50 text-slate-600 py-2 rounded-lg text-sm hover:bg-slate-100">Cancel</button>
              <button onClick={handleTransfer} disabled={!transferUserId.trim() || acting} className="flex-1 bg-amber-500 text-white py-2 rounded-lg text-sm hover:bg-amber-400 disabled:opacity-50">
                {acting ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
