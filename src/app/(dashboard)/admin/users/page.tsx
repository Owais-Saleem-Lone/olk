'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { banUser, unbanUser, warnUser, resetUserProfile, setAdminRole } from '@/lib/admin-actions'

type User = {
  id: string
  display_name: string | null
  area_name: string | null
  is_admin: boolean
  admin_role: string | null
  is_banned: boolean
  ban_reason: string | null
  ban_expires_at: string | null
  warning_count: number
  created_at: string
  last_active_at: string | null
}

type UserDetail = User & {
  books_count: number
  requests_count: number
  warnings: { id: string; reason: string; created_at: string; admin_id: string; admin_name: string | null }[]
  bans: { id: string; reason: string; is_permanent: boolean; created_at: string; expires_at: string | null; unbanned_at: string | null }[]
}

export default function AdminUsersPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'banned' | 'admin' | 'warned'>('all')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<UserDetail | null>(null)
  const [modal, setModal] = useState<'ban' | 'warn' | 'role' | null>(null)
  const [actionMsg, setActionMsg] = useState('')

  // Modal form state
  const [banReason, setBanReason] = useState('')
  const [banPermanent, setBanPermanent] = useState(false)
  const [banDays, setBanDays] = useState(7)
  const [warnReason, setWarnReason] = useState('')
  const [newRole, setNewRole] = useState<string>('moderator')
  const [acting, setActing] = useState(false)

  useEffect(() => { loadUsers() }, [filter])

  async function loadUsers() {
    setLoading(true)
    let query = supabase
      .from('profiles')
      .select('id, display_name, area_name, is_admin, admin_role, is_banned, ban_reason, ban_expires_at, warning_count, created_at, last_active_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filter === 'banned') query = query.eq('is_banned', true)
    if (filter === 'admin') query = query.eq('is_admin', true)
    if (filter === 'warned') query = query.gt('warning_count', 0)

    const { data } = await query
    setUsers(data || [])
    setLoading(false)
  }

  async function selectUser(user: User) {
    const [
      { count: bc },
      { count: rc },
      { data: warnings },
      { data: bans },
    ] = await Promise.all([
      supabase.from('books').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
      supabase.from('book_requests').select('*', { count: 'exact', head: true }).eq('requester_id', user.id),
      supabase.from('user_warnings').select('id, reason, created_at, admin_id').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('user_bans').select('id, reason, is_permanent, created_at, expires_at, unbanned_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    const adminIds = [...new Set((warnings || []).map((w: { admin_id: string }) => w.admin_id))]
    let adminMap = new Map<string, string | null>()
    if (adminIds.length > 0) {
      const { data: admins } = await supabase.from('profiles').select('id, display_name').in('id', adminIds)
      adminMap = new Map((admins || []).map(a => [a.id, a.display_name]))
    }

    setSelected({
      ...user,
      books_count: bc || 0,
      requests_count: rc || 0,
      warnings: ((warnings || []) as { id: string; reason: string; created_at: string; admin_id: string }[]).map(w => ({
        ...w,
        admin_name: adminMap.get(w.admin_id) || null,
      })),
      bans: (bans as unknown as UserDetail['bans']) || [],
    })
  }

  const filteredUsers = search
    ? users.filter(u =>
        u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.area_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.id.toLowerCase().includes(search.toLowerCase())
      )
    : users

  async function handleBan() {
    if (!selected || !banReason.trim()) return
    setActing(true)
    const res = await banUser(selected.id, banReason, banPermanent, banPermanent ? undefined : banDays)
    setActing(false)
    if (res.success) {
      setActionMsg('User banned successfully')
      setModal(null)
      setBanReason('')
      loadUsers()
      setSelected(null)
    } else {
      setActionMsg(res.error || 'Failed')
    }
  }

  async function handleUnban() {
    if (!selected) return
    setActing(true)
    const res = await unbanUser(selected.id)
    setActing(false)
    if (res.success) {
      setActionMsg('User unbanned')
      loadUsers()
      setSelected(null)
    } else {
      setActionMsg(res.error || 'Failed')
    }
  }

  async function handleWarn() {
    if (!selected || !warnReason.trim()) return
    setActing(true)
    const res = await warnUser(selected.id, warnReason)
    setActing(false)
    if (res.success) {
      setActionMsg('Warning sent')
      setModal(null)
      setWarnReason('')
      loadUsers()
      setSelected(null)
    } else {
      setActionMsg(res.error || 'Failed')
    }
  }

  async function handleResetField(field: 'display_name' | 'area_name') {
    if (!selected) return
    setActing(true)
    const res = await resetUserProfile(selected.id, field)
    setActing(false)
    if (res.success) {
      setActionMsg(`${field} reset`)
      loadUsers()
      setSelected(null)
    }
  }

  async function handleSetRole() {
    if (!selected) return
    setActing(true)
    const role = newRole === 'remove' ? null : (newRole as 'super_admin' | 'moderator' | 'viewer')
    const res = await setAdminRole(selected.id, role)
    setActing(false)
    if (res.success) {
      setActionMsg('Role updated')
      setModal(null)
      loadUsers()
      setSelected(null)
    }
  }

  return (
    <div>
      {actionMsg && (
        <div className="mb-4 bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm px-4 py-2 rounded-lg flex justify-between">
          {actionMsg}
          <button onClick={() => setActionMsg('')} className="text-teal-400/50 hover:text-teal-400">×</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, area, or ID..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex gap-1">
          {(['all', 'banned', 'admin', 'warned'] as const).map(f => (
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
      </div>

      <div className="flex gap-4">
        {/* User List */}
        <div className={`${selected ? 'hidden md:block md:w-1/2 lg:w-2/5' : 'w-full'} space-y-1.5`}>
          {loading ? (
            <p className="text-slate-500 py-8 text-center">Loading users...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No users found</p>
          ) : (
            filteredUsers.map(u => (
              <button
                key={u.id}
                onClick={() => selectUser(u)}
                className={`w-full text-left bg-white/[0.03] border rounded-xl p-3 transition-colors ${
                  selected?.id === u.id ? 'border-teal-500/30 bg-teal-500/5' : 'border-white/[0.06] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {u.display_name || 'No name'}
                      {u.is_banned && <span className="ml-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">Banned</span>}
                      {u.is_admin && <span className="ml-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">{u.admin_role?.replace('_', ' ') || 'Admin'}</span>}
                      {u.warning_count > 0 && <span className="ml-2 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-full">{u.warning_count}w</span>}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {u.area_name || 'No area'} · Joined {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-slate-600 text-xs">→</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* User Detail Panel */}
        {selected && (
          <div className="flex-1 min-w-0">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selected.display_name || 'No name'}</h3>
                  <p className="text-xs text-slate-500 font-mono">{selected.id}</p>
                  <p className="text-sm text-slate-400 mt-1">{selected.area_name || 'No area set'}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-lg">×</button>
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {selected.is_banned && <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-lg">Banned: {selected.ban_reason}</span>}
                {selected.is_admin && <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-lg">{selected.admin_role?.replace('_', ' ')}</span>}
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-4 gap-2 mb-5">
                {[
                  { label: 'Books', v: selected.books_count },
                  { label: 'Requests', v: selected.requests_count },
                  { label: 'Warnings', v: selected.warning_count },
                  { label: 'Bans', v: selected.bans.length },
                ].map(s => (
                  <div key={s.label} className="text-center py-2 bg-white/[0.03] rounded-lg">
                    <p className="text-lg font-bold text-white">{s.v}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mb-5">
                {selected.is_banned ? (
                  <button onClick={handleUnban} disabled={acting} className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">Unban</button>
                ) : (
                  <button onClick={() => setModal('ban')} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors">Ban</button>
                )}
                <button onClick={() => setModal('warn')} className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 px-3 py-1.5 rounded-lg transition-colors">Warn</button>
                <button onClick={() => handleResetField('display_name')} disabled={acting} className="text-xs bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">Reset Name</button>
                <button onClick={() => handleResetField('area_name')} disabled={acting} className="text-xs bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">Reset Area</button>
                <button onClick={() => setModal('role')} className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors">Set Role</button>
              </div>

              {/* Dates */}
              <div className="text-xs text-slate-500 space-y-0.5 mb-5">
                <p>Joined: {new Date(selected.created_at).toLocaleString()}</p>
                {selected.last_active_at && <p>Last active: {new Date(selected.last_active_at).toLocaleString()}</p>}
                {selected.ban_expires_at && <p>Ban expires: {new Date(selected.ban_expires_at).toLocaleString()}</p>}
              </div>

              {/* Warning history */}
              {selected.warnings.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-300 mb-2">Warning History</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selected.warnings.map(w => (
                      <div key={w.id} className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-2">
                        <p className="text-xs text-orange-300">{w.reason}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          by {w.admin_name || 'Admin'} · {new Date(w.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ban history */}
              {selected.bans.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-300 mb-2">Ban History</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selected.bans.map(b => (
                      <div key={b.id} className={`border rounded-lg p-2 ${b.unbanned_at ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-red-500/5 border-red-500/10'}`}>
                        <p className="text-xs text-slate-300">{b.reason}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {b.is_permanent ? 'Permanent' : b.expires_at ? `Until ${new Date(b.expires_at).toLocaleDateString()}` : ''}
                          {b.unbanned_at && ' · Unbanned'}
                          {' · '}{new Date(b.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ban Modal */}
      {modal === 'ban' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Ban User</h3>
            <p className="text-sm text-slate-400 mb-4">Banning: {selected?.display_name}</p>
            <textarea
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              placeholder="Reason for ban..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-3"
            />
            <label className="flex items-center gap-2 mb-3">
              <input type="checkbox" checked={banPermanent} onChange={e => setBanPermanent(e.target.checked)} className="rounded" />
              <span className="text-sm text-slate-300">Permanent ban</span>
            </label>
            {!banPermanent && (
              <div className="mb-4">
                <label className="text-sm text-slate-400">Duration (days)</label>
                <input
                  type="number"
                  value={banDays}
                  onChange={e => setBanDays(Number(e.target.value))}
                  min={1}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={handleBan} disabled={!banReason.trim() || acting} className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm hover:bg-red-400 disabled:opacity-50 transition-colors">
                {acting ? 'Banning...' : 'Ban User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warn Modal */}
      {modal === 'warn' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Warn User</h3>
            <p className="text-sm text-slate-400 mb-4">Warning: {selected?.display_name}</p>
            <textarea
              value={warnReason}
              onChange={e => setWarnReason(e.target.value)}
              placeholder="Reason for warning..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={handleWarn} disabled={!warnReason.trim() || acting} className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm hover:bg-orange-400 disabled:opacity-50 transition-colors">
                {acting ? 'Sending...' : 'Send Warning'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {modal === 'role' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Set Admin Role</h3>
            <p className="text-sm text-slate-400 mb-4">User: {selected?.display_name}</p>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="super_admin">Super Admin (full access)</option>
              <option value="moderator">Moderator (reports + content)</option>
              <option value="viewer">Viewer (read-only dashboard)</option>
              <option value="remove">Remove admin access</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={handleSetRole} disabled={acting} className="flex-1 bg-amber-500 text-white py-2 rounded-lg text-sm hover:bg-amber-400 disabled:opacity-50 transition-colors">
                {acting ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
