"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Report = {
  id: string
  reason: string
  details: string | null
  status: string
  created_at: string
  reporter: { display_name: string | null } | null
  reported_user: { display_name: string | null } | null
  reported_book: { title: string } | null
}

type UserProfile = {
  id: string
  display_name: string | null
  area_name: string | null
  is_admin: boolean
}

type BookOfMonth = {
  id: string
  title: string
  author: string | null
  description: string | null
  cover_url: string | null
  month_label: string | null
  active: boolean
}

export default function AdminPage() {
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'overview' | 'reports' | 'botm' | 'users'>('overview')

  // Overview
  const [stats, setStats] = useState({ users: 0, books: 0, requests: 0, reports: 0 })

  // Reports
  const [reports, setReports] = useState<Report[]>([])

  // Book of the Month
  const [botm, setBotm] = useState<BookOfMonth | null>(null)
  const [botmTitle, setBotmTitle] = useState('')
  const [botmAuthor, setBotmAuthor] = useState('')
  const [botmDesc, setBotmDesc] = useState('')
  const [botmCover, setBotmCover] = useState('')
  const [botmLabel, setBotmLabel] = useState('')
  const [botmSaving, setBotmSaving] = useState(false)
  const [botmMsg, setBotmMsg] = useState('')

  // Users
  const [users, setUsers] = useState<UserProfile[]>([])
  const [userSearch, setUserSearch] = useState('')

  useEffect(() => { checkAdmin() }, [])

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setIsAdmin(false); return }
    const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    const admin = data?.is_admin === true
    setIsAdmin(admin)
    if (admin) {
      fetchStats()
      fetchReports()
      fetchBotm()
      fetchUsers()
    }
  }

  const fetchStats = async () => {
    const [{ count: uc }, { count: bc }, { count: rc }, { count: rpc }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('books').select('*', { count: 'exact', head: true }),
      supabase.from('book_requests').select('*', { count: 'exact', head: true }),
      supabase.from('reports').select('*', { count: 'exact', head: true }),
    ])
    setStats({ users: uc || 0, books: bc || 0, requests: rc || 0, reports: rpc || 0 })
  }

  const fetchReports = async () => {
    const { data } = await supabase
      .from('reports')
      .select('id, reason, details, status, created_at, reporter:reporter_id(display_name), reported_user:reported_user_id(display_name), reported_book:reported_book_id(title)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setReports(data as any)
  }

  const fetchBotm = async () => {
    const { data } = await supabase
      .from('book_of_month')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      setBotm(data)
      setBotmTitle(data.title)
      setBotmAuthor(data.author || '')
      setBotmDesc(data.description || '')
      setBotmCover(data.cover_url || '')
      setBotmLabel(data.month_label || '')
    }
  }

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, area_name, is_admin')
      .order('display_name', { ascending: true })
      .limit(100)
    if (data) setUsers(data)
  }

  const handleReportStatus = async (id: string, newStatus: string) => {
    await supabase.from('reports').update({ status: newStatus }).eq('id', id)
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r))
  }

  const handleSaveBotm = async () => {
    if (!botmTitle.trim()) return
    setBotmSaving(true)
    setBotmMsg('')

    if (botm) {
      await supabase.from('book_of_month').update({ active: false }).eq('id', botm.id)
    }

    const { error } = await supabase.from('book_of_month').insert({
      title: botmTitle.trim(),
      author: botmAuthor.trim() || null,
      description: botmDesc.trim() || null,
      cover_url: botmCover.trim() || null,
      month_label: botmLabel.trim() || null,
      active: true,
    })

    if (error) {
      setBotmMsg('Error: ' + error.message)
    } else {
      setBotmMsg('Book of the Month updated!')
      fetchBotm()
    }
    setBotmSaving(false)
  }

  const handleToggleAdmin = async (userId: string, current: boolean) => {
    await supabase.from('profiles').update({ is_admin: !current }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: !current } : u))
  }

  if (isAdmin === null) return <p className="text-slate-400">Checking access...</p>
  if (!isAdmin) return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
      <p className="text-slate-400">You don&apos;t have admin privileges.</p>
    </div>
  )

  const TABS = [
    { key: 'overview' as const, label: '📊 Overview' },
    { key: 'reports' as const, label: '🚩 Reports' },
    { key: 'botm' as const, label: '📖 Book of Month' },
    { key: 'users' as const, label: '👥 Users' },
  ]

  const filteredUsers = userSearch
    ? users.filter(u => u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.area_name?.toLowerCase().includes(userSearch.toLowerCase()))
    : users

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
      <p className="text-slate-400 mb-8">Manage your platform</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Users', value: stats.users, icon: '👥' },
            { label: 'Books', value: stats.books, icon: '📚' },
            { label: 'Requests', value: stats.requests, icon: '📩' },
            { label: 'Reports', value: stats.reports, icon: '🚩' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="text-3xl font-bold text-white">{s.value}</p>
              <p className="text-sm text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Reports ── */}
      {tab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-8 text-center text-slate-500">
              No reports yet.
            </div>
          ) : (
            reports.map(r => (
              <div key={r.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white mb-1">{r.reason}</p>
                    {r.details && <p className="text-xs text-slate-400 mb-2">{r.details}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>By: {r.reporter?.display_name || 'Unknown'}</span>
                      {r.reported_user?.display_name && <span>Against: {r.reported_user.display_name}</span>}
                      {r.reported_book?.title && <span>Book: {r.reported_book.title}</span>}
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => handleReportStatus(r.id, 'resolved')}
                          className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => handleReportStatus(r.id, 'dismissed')}
                          className="text-xs bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Dismiss
                        </button>
                      </>
                    ) : (
                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                        r.status === 'resolved'
                          ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                          : 'bg-white/5 text-slate-500 border border-white/10'
                      }`}>
                        {r.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Book of the Month ── */}
      {tab === 'botm' && (
        <div className="max-w-lg">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-5">
              {botm ? 'Update Book of the Month' : 'Set Book of the Month'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  value={botmTitle}
                  onChange={e => setBotmTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Book title"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Author</label>
                <input
                  type="text"
                  value={botmAuthor}
                  onChange={e => setBotmAuthor(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Author name"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Description</label>
                <textarea
                  value={botmDesc}
                  onChange={e => setBotmDesc(e.target.value)}
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  placeholder="Why this book?"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Cover Image URL</label>
                <input
                  type="url"
                  value={botmCover}
                  onChange={e => setBotmCover(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Month Label</label>
                <input
                  type="text"
                  value={botmLabel}
                  onChange={e => setBotmLabel(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. June 2026"
                />
              </div>
              <button
                onClick={handleSaveBotm}
                disabled={!botmTitle.trim() || botmSaving}
                className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                {botmSaving ? 'Saving...' : botm ? 'Update & Replace' : 'Set as Book of the Month'}
              </button>
              {botmMsg && (
                <p className={`text-sm text-center ${botmMsg.startsWith('Error') ? 'text-red-400' : 'text-teal-400'}`}>
                  {botmMsg}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Users ── */}
      {tab === 'users' && (
        <div>
          <input
            type="text"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full max-w-sm bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 mb-4"
          />
          <div className="space-y-2">
            {filteredUsers.map(u => (
              <div key={u.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {u.display_name || 'No name'}
                    {u.is_admin && <span className="ml-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Admin</span>}
                  </p>
                  {u.area_name && <p className="text-xs text-slate-500">📍 {u.area_name}</p>}
                  <p className="text-xs text-slate-700 font-mono mt-0.5">{u.id.slice(0, 8)}...</p>
                </div>
                <button
                  onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    u.is_admin
                      ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                      : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
