'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendBroadcastNotification, sendDirectNotification } from '@/lib/admin-actions'

type Template = { id: string; name: string; title: string; body: string | null; type: string }

export default function AdminNotificationsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'broadcast' | 'direct' | 'templates'>('broadcast')
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)

  // Broadcast
  const [bTitle, setBTitle] = useState('')
  const [bBody, setBBody] = useState('')
  const [bLink, setBLink] = useState('')
  const [bArea, setBArea] = useState('')
  const [areas, setAreas] = useState<string[]>([])
  const [userCount, setUserCount] = useState<number | null>(null)

  // Direct
  const [dUserId, setDUserId] = useState('')
  const [dUserSearch, setDUserSearch] = useState('')
  const [dTitle, setDTitle] = useState('')
  const [dBody, setDBody] = useState('')
  const [userResults, setUserResults] = useState<{ id: string; display_name: string | null }[]>([])

  // Templates
  const [templates, setTemplates] = useState<Template[]>([])

  const loadAreas = useCallback(async () => {
    const { data } = await supabase.from('areas').select('name').eq('active', true).order('name')
    setAreas(data?.map(a => a.name) || [])
  }, [supabase])

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from('notification_templates').select('*').order('name')
    setTemplates(data || [])
  }, [supabase])

  useEffect(() => {
    queueMicrotask(() => { loadAreas(); loadTemplates() })
  }, [loadAreas, loadTemplates])

  useEffect(() => {
    if (bArea) {
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('area_name', bArea).then(({ count }) => setUserCount(count ?? 0))
    } else {
      supabase.from('profiles').select('id', { count: 'exact', head: true }).then(({ count }) => setUserCount(count ?? 0))
    }
  }, [bArea, supabase])

  async function searchUsers(query: string) {
    setDUserSearch(query)
    if (query.length < 2) { setUserResults([]); return }
    const { data } = await supabase.from('profiles').select('id, display_name').ilike('display_name', `%${query}%`).limit(10)
    setUserResults(data || [])
  }

  async function handleBroadcast() {
    if (!bTitle.trim()) return
    setActing(true)
    const res = await sendBroadcastNotification(bTitle, bBody || undefined, bLink || undefined, bArea || undefined)
    setActing(false)
    if (res.success) { setMsg(`Broadcast sent to ${userCount} users`); setBTitle(''); setBBody(''); setBLink('') }
    else setMsg(res.error || 'Failed')
  }

  async function handleDirect() {
    if (!dUserId || !dTitle.trim()) return
    setActing(true)
    const res = await sendDirectNotification(dUserId, dTitle, dBody || undefined)
    setActing(false)
    if (res.success) { setMsg('Notification sent'); setDTitle(''); setDBody(''); setDUserId(''); setDUserSearch('') }
    else setMsg(res.error || 'Failed')
  }

  function applyTemplate(t: Template) {
    if (tab === 'broadcast') { setBTitle(t.title); setBBody(t.body || '') }
    else if (tab === 'direct') { setDTitle(t.title); setDBody(t.body || '') }
    setTab(tab === 'templates' ? 'broadcast' : tab)
  }

  return (
    <div>
      {msg && (
        <div className="mb-4 bg-brand-teal/10 border border-brand-teal/20 text-brand-teal-light text-sm px-4 py-2 rounded-lg flex justify-between">
          {msg}<button onClick={() => setMsg('')} className="text-brand-teal-light/50 hover:text-brand-teal-light">×</button>
        </div>
      )}

      <div className="flex gap-1 mb-6">
        {[
          { key: 'broadcast' as const, label: 'Broadcast' },
          { key: 'direct' as const, label: 'Direct Message' },
          { key: 'templates' as const, label: 'Templates' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Broadcast ═══ */}
      {tab === 'broadcast' && (
        <div className="max-w-lg">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Send Broadcast Notification</h3>
            {userCount !== null && (
              <p className="text-xs text-slate-500 mb-4">
                Will be sent to <span className="text-brand-teal-light font-semibold">{userCount}</span> {bArea ? `users in ${bArea}` : 'users'}
              </p>
            )}
            <div className="space-y-3">
              <input type="text" value={bTitle} onChange={e => setBTitle(e.target.value)} placeholder="Notification title" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <textarea value={bBody} onChange={e => setBBody(e.target.value)} placeholder="Body (optional)" rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none" />
              <input type="text" value={bLink} onChange={e => setBLink(e.target.value)} placeholder="Link (optional, e.g. /browse)" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <select value={bArea} onChange={e => setBArea(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal">
                <option value="">All areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <button onClick={handleBroadcast} disabled={!bTitle.trim() || acting} className="w-full bg-brand-teal hover:bg-brand-teal-light text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {acting ? 'Sending...' : 'Send Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Direct ═══ */}
      {tab === 'direct' && (
        <div className="max-w-lg">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Send Direct Notification</h3>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={dUserSearch}
                  onChange={e => searchUsers(e.target.value)}
                  placeholder="Search user by name..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
                {userResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-brand-slate border border-white/10 rounded-lg overflow-hidden z-10 max-h-48 overflow-y-auto">
                    {userResults.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setDUserId(u.id); setDUserSearch(u.display_name || u.id); setUserResults([]) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
                      >
                        {u.display_name || 'No name'} <span className="text-xs text-slate-600 font-mono">{u.id.slice(0, 8)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {dUserId && <p className="text-xs text-brand-teal-light">Selected: {dUserId.slice(0, 12)}...</p>}
              <input type="text" value={dTitle} onChange={e => setDTitle(e.target.value)} placeholder="Notification title" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <textarea value={dBody} onChange={e => setDBody(e.target.value)} placeholder="Body (optional)" rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none" />
              <button onClick={handleDirect} disabled={!dUserId || !dTitle.trim() || acting} className="w-full bg-brand-teal hover:bg-brand-teal-light text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {acting ? 'Sending...' : 'Send Notification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Templates ═══ */}
      {tab === 'templates' && (
        <div className="space-y-2">
          {templates.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No templates</p>
          ) : (
            templates.map(t => (
              <div key={t.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.name}</p>
                  {t.body && <p className="text-xs text-slate-400 mt-1 truncate">{t.body}</p>}
                </div>
                <button onClick={() => applyTemplate(t)} className="text-xs bg-brand-teal/10 text-brand-teal-light border border-brand-teal/20 hover:bg-brand-teal/20 px-3 py-1.5 rounded-lg transition-colors ml-3">Use</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
