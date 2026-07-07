'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createAnnouncement, deleteAnnouncement, manageGenre, manageArea, saveBotm } from '@/lib/admin-actions'

type Announcement = { id: string; title: string; body: string | null; type: string; is_banner: boolean; active: boolean; starts_at: string; ends_at: string | null; created_at: string }
type Genre = { id: string; name: string; display_order: number; active: boolean }
type Area = { id: string; name: string; district: string | null; active: boolean }
type BotM = { id: string; title: string; author: string | null; description: string | null; cover_url: string | null; month_label: string | null; active: boolean }

export default function AdminContentPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'announcements' | 'genres' | 'areas' | 'botm'>('announcements')
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annType, setAnnType] = useState('info')
  const [annBanner, setAnnBanner] = useState(false)
  const [annEndsAt, setAnnEndsAt] = useState('')

  // Genres
  const [genres, setGenres] = useState<Genre[]>([])
  const [newGenre, setNewGenre] = useState('')

  // Areas
  const [areas, setAreas] = useState<Area[]>([])
  const [newAreaName, setNewAreaName] = useState('')
  const [newAreaDistrict, setNewAreaDistrict] = useState('')

  // BOTM
  const [botm, setBotm] = useState<BotM | null>(null)
  const [botmTitle, setBotmTitle] = useState('')
  const [botmAuthor, setBotmAuthor] = useState('')
  const [botmDesc, setBotmDesc] = useState('')
  const [botmCover, setBotmCover] = useState('')
  const [botmLabel, setBotmLabel] = useState('')

  const loadAnnouncements = useCallback(async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(50)
    setAnnouncements(data || [])
  }, [supabase])

  const loadGenres = useCallback(async () => {
    const { data } = await supabase.from('genres').select('*').order('display_order')
    setGenres(data || [])
  }, [supabase])

  const loadAreas = useCallback(async () => {
    const { data } = await supabase.from('areas').select('*').order('district, name')
    setAreas(data || [])
  }, [supabase])

  const loadBotm = useCallback(async () => {
    const { data } = await supabase.from('book_of_month').select('*').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (data) {
      setBotm(data)
      setBotmTitle(data.title)
      setBotmAuthor(data.author || '')
      setBotmDesc(data.description || '')
      setBotmCover(data.cover_url || '')
      setBotmLabel(data.month_label || '')
    }
  }, [supabase])

  useEffect(() => {
    queueMicrotask(() => {
      if (tab === 'announcements') loadAnnouncements()
      if (tab === 'genres') loadGenres()
      if (tab === 'areas') loadAreas()
      if (tab === 'botm') loadBotm()
    })
  }, [tab, loadAnnouncements, loadGenres, loadAreas, loadBotm])

  async function handleCreateAnnouncement() {
    if (!annTitle.trim()) return
    setActing(true)
    const res = await createAnnouncement({ title: annTitle, body: annBody || undefined, type: annType, isBanner: annBanner, endsAt: annEndsAt || undefined })
    setActing(false)
    if (res.success) { setMsg('Announcement created'); setAnnTitle(''); setAnnBody(''); loadAnnouncements() }
  }

  async function handleDeleteAnn(id: string) {
    const res = await deleteAnnouncement(id)
    if (res.success) { setMsg('Announcement deleted'); loadAnnouncements() }
  }

  async function handleAddGenre() {
    if (!newGenre.trim()) return
    setActing(true)
    const res = await manageGenre('add', newGenre)
    setActing(false)
    if (res.success) { setNewGenre(''); loadGenres() }
    else setMsg(res.error || 'Failed')
  }

  async function handleToggleGenre(name: string, active: boolean) {
    await manageGenre('toggle', name, !active)
    loadGenres()
  }

  async function handleAddArea() {
    if (!newAreaName.trim()) return
    setActing(true)
    const res = await manageArea('add', newAreaName, newAreaDistrict || undefined)
    setActing(false)
    if (res.success) { setNewAreaName(''); setNewAreaDistrict(''); loadAreas() }
    else setMsg(res.error || 'Failed')
  }

  async function handleToggleArea(name: string, active: boolean) {
    await manageArea('toggle', name, undefined, !active)
    loadAreas()
  }

  async function handleSaveBotm() {
    if (!botmTitle.trim()) return
    setActing(true)
    const res = await saveBotm({ title: botmTitle, author: botmAuthor || undefined, description: botmDesc || undefined, coverUrl: botmCover || undefined, monthLabel: botmLabel || undefined })
    setActing(false)
    if (res.success) { setMsg('Book of the Month updated!'); loadBotm() }
  }

  const TABS = [
    { key: 'announcements' as const, label: 'Announcements' },
    { key: 'genres' as const, label: 'Genres' },
    { key: 'areas' as const, label: 'Areas' },
    { key: 'botm' as const, label: 'Book of Month' },
  ]

  return (
    <div>
      {msg && (
        <div className="mb-4 bg-brand-teal/10 border border-brand-teal/20 text-brand-teal-light text-sm px-4 py-2 rounded-lg flex justify-between">
          {msg}<button onClick={() => setMsg('')} className="text-brand-teal-light/50 hover:text-brand-teal-light">×</button>
        </div>
      )}

      <div className="flex gap-1 mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Announcements ═══ */}
      {tab === 'announcements' && (
        <div className="space-y-4">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <h3 className="text-sm font-medium text-slate-300 mb-4">New Announcement</h3>
            <div className="space-y-3">
              <input type="text" value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="Title" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} placeholder="Body (optional)" rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none" />
              <div className="flex gap-3">
                <select value={annType} onChange={e => setAnnType(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="success">Success</option>
                  <option value="event">Event</option>
                </select>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={annBanner} onChange={e => setAnnBanner(e.target.checked)} className="rounded" />
                  <span className="text-sm text-slate-300">Show as banner</span>
                </label>
                <input type="datetime-local" value={annEndsAt} onChange={e => setAnnEndsAt(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              </div>
              <button onClick={handleCreateAnnouncement} disabled={!annTitle.trim() || acting} className="bg-brand-teal hover:bg-brand-teal-light text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors disabled:opacity-50">
                {acting ? 'Creating...' : 'Create Announcement'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {announcements.map(a => (
              <div key={a.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-white">{a.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        a.type === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                        a.type === 'success' ? 'bg-green-500/10 text-green-400' :
                        a.type === 'event' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-blue-500/10 text-blue-400'
                      }`}>{a.type}</span>
                      {a.is_banner && <span className="text-xs bg-brand-teal/10 text-brand-teal-light px-2 py-0.5 rounded-full">Banner</span>}
                    </div>
                    {a.body && <p className="text-xs text-slate-400">{a.body}</p>}
                    <p className="text-xs text-slate-600 mt-1">{new Date(a.created_at).toLocaleDateString()} {a.ends_at ? `· Ends ${new Date(a.ends_at).toLocaleDateString()}` : ''}</p>
                  </div>
                  <button onClick={() => handleDeleteAnn(a.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Genres ═══ */}
      {tab === 'genres' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input type="text" value={newGenre} onChange={e => setNewGenre(e.target.value)} placeholder="New genre name" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" onKeyDown={e => e.key === 'Enter' && handleAddGenre()} />
            <button onClick={handleAddGenre} disabled={!newGenre.trim() || acting} className="bg-brand-teal hover:bg-brand-teal-light text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {genres.map(g => (
              <button
                key={g.id}
                onClick={() => handleToggleGenre(g.name, g.active)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  g.active ? 'bg-brand-teal/10 text-brand-teal-light border-brand-teal/20 hover:bg-brand-teal/20' : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:bg-white/5 line-through'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Areas ═══ */}
      {tab === 'areas' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input type="text" value={newAreaName} onChange={e => setNewAreaName(e.target.value)} placeholder="Area name" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            <input type="text" value={newAreaDistrict} onChange={e => setNewAreaDistrict(e.target.value)} placeholder="District" className="w-40 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            <button onClick={handleAddArea} disabled={!newAreaName.trim() || acting} className="bg-brand-teal hover:bg-brand-teal-light text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">Add</button>
          </div>
          {(() => {
            const grouped: Record<string, Area[]> = {}
            areas.forEach(a => {
              const d = a.district || 'Other'
              if (!grouped[d]) grouped[d] = []
              grouped[d].push(a)
            })
            return Object.entries(grouped).map(([district, distAreas]) => (
              <div key={district} className="mb-4">
                <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">{district}</p>
                <div className="flex flex-wrap gap-2">
                  {distAreas.map(a => (
                    <button
                      key={a.id}
                      onClick={() => handleToggleArea(a.name, a.active)}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                        a.active ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10' : 'bg-white/[0.02] text-slate-600 border-white/[0.04] line-through'
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      )}

      {/* ═══ Book of the Month ═══ */}
      {tab === 'botm' && (
        <div className="max-w-lg">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-slate-300 mb-4">{botm ? 'Update Book of the Month' : 'Set Book of the Month'}</h3>
            <div className="space-y-3">
              <input type="text" value={botmTitle} onChange={e => setBotmTitle(e.target.value)} placeholder="Title" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <input type="text" value={botmAuthor} onChange={e => setBotmAuthor(e.target.value)} placeholder="Author" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <textarea value={botmDesc} onChange={e => setBotmDesc(e.target.value)} placeholder="Why this book?" rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none" />
              <input type="url" value={botmCover} onChange={e => setBotmCover(e.target.value)} placeholder="Cover Image URL" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <input type="text" value={botmLabel} onChange={e => setBotmLabel(e.target.value)} placeholder="e.g. July 2026" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <button onClick={handleSaveBotm} disabled={!botmTitle.trim() || acting} className="w-full bg-brand-teal hover:bg-brand-teal-light text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {acting ? 'Saving...' : botm ? 'Update & Replace' : 'Set as Book of the Month'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
