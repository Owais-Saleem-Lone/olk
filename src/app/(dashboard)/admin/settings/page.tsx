'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { updatePlatformSetting } from '@/lib/admin-actions'

type Setting = { key: string; value: string; description: string | null; updated_at: string }
type AuditEntry = {
  id: string
  action: string
  target_type: string
  target_id: string | null
  details: Record<string, unknown>
  created_at: string
  admin: { display_name: string | null } | null
}

export default function AdminSettingsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'settings' | 'audit'>('settings')
  const [settings, setSettings] = useState<Setting[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [editingSetting, setEditingSetting] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)
  const [auditFilter, setAuditFilter] = useState('')
  const [auditPage, setAuditPage] = useState(0)
  const PAGE_SIZE = 50

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('platform_settings').select('*').order('key')
    if (data) setSettings(data.map(s => ({ ...s, value: typeof s.value === 'string' ? s.value : JSON.stringify(s.value) })))
  }, [supabase])

  const loadAudit = useCallback(async () => {
    let query = supabase
      .from('admin_audit_log')
      .select('id, action, target_type, target_id, details, created_at, admin:admin_id(display_name)')
      .order('created_at', { ascending: false })
      .range(auditPage * PAGE_SIZE, (auditPage + 1) * PAGE_SIZE - 1)

    if (auditFilter) query = query.eq('action', auditFilter)
    const { data } = await query
    setAudit((data || []) as unknown as AuditEntry[])
  }, [supabase, auditPage, auditFilter])

  useAsyncEffect(() => {
    if (tab === 'settings') loadSettings(); else loadAudit()
  }, [tab, loadSettings, loadAudit])

  async function handleSaveSetting(key: string) {
    setActing(true)
    const res = await updatePlatformSetting(key, editValue)
    setActing(false)
    if (res.success) { setMsg('Setting updated'); setEditingSetting(null); loadSettings() }
    else setMsg(res.error || 'Failed')
  }

  function isFeatureFlag(key: string) { return key.startsWith('feature_') || key === 'maintenance_mode' }

  async function toggleFeature(key: string, current: string) {
    const newVal = current === 'true' ? 'false' : 'true'
    setActing(true)
    const res = await updatePlatformSetting(key, newVal)
    setActing(false)
    if (res.success) { loadSettings() }
  }

  const featureSettings = settings.filter(s => isFeatureFlag(s.key))
  const otherSettings = settings.filter(s => !isFeatureFlag(s.key))

  const actionColor: Record<string, string> = {
    ban_user: 'text-red-400',
    unban_user: 'text-green-400',
    warn_user: 'text-orange-400',
    hide_book: 'text-red-400',
    unhide_book: 'text-green-400',
    set_admin_role: 'text-amber-400',
    update_setting: 'text-purple-400',
    broadcast_notification: 'text-blue-400',
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
          { key: 'settings' as const, label: 'Platform Settings' },
          { key: 'audit' as const, label: 'Audit Log' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Settings ═══ */}
      {tab === 'settings' && (
        <div className="space-y-6">
          {/* Feature Flags */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">Feature Flags</h3>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl divide-y divide-white/[0.04]">
              {featureSettings.map(s => (
                <div key={s.key} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm text-white">{s.key.replace('feature_', '').replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</p>
                    <p className="text-xs text-slate-500">{s.description}</p>
                  </div>
                  <button
                    onClick={() => toggleFeature(s.key, s.value)}
                    disabled={acting}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      s.value === 'true' ? 'bg-brand-teal' : 'bg-white/10'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      s.value === 'true' ? 'left-6' : 'left-1'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Rate Limits & Config */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">Configuration</h3>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl divide-y divide-white/[0.04]">
              {otherSettings.map(s => (
                <div key={s.key} className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{s.key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</p>
                    <p className="text-xs text-slate-500">{s.description}</p>
                  </div>
                  {editingSetting === s.key ? (
                    <div className="flex gap-2 ml-4">
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                        autoFocus
                      />
                      <button onClick={() => handleSaveSetting(s.key)} disabled={acting} className="text-xs bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal-light disabled:opacity-50">Save</button>
                      <button onClick={() => setEditingSetting(null)} className="text-xs text-slate-400 px-2 py-1.5">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-sm text-brand-teal-light font-mono">{s.value}</span>
                      <button
                        onClick={() => { setEditingSetting(s.key); setEditValue(s.value) }}
                        className="text-xs text-slate-500 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Audit Log ═══ */}
      {tab === 'audit' && (
        <div>
          <div className="flex gap-2 mb-4">
            <select
              value={auditFilter}
              onChange={e => { setAuditFilter(e.target.value); setAuditPage(0) }}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal"
            >
              <option value="">All Actions</option>
              {['ban_user', 'unban_user', 'warn_user', 'hide_book', 'unhide_book', 'edit_book', 'cancel_request', 'force_return', 'update_report', 'set_admin_role', 'update_setting', 'broadcast_notification', 'create_announcement', 'deactivate_club'].map(a => (
                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            {audit.length === 0 ? (
              <p className="text-slate-500 py-8 text-center">No audit entries</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-white/5">
                      <th className="p-3 font-medium">Time</th>
                      <th className="p-3 font-medium">Admin</th>
                      <th className="p-3 font-medium">Action</th>
                      <th className="p-3 font-medium">Target</th>
                      <th className="p-3 font-medium hidden lg:table-cell">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map(a => (
                      <tr key={a.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="p-3 text-slate-500 text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                        <td className="p-3 text-slate-300">{(a.admin as { display_name: string | null } | null)?.display_name || 'Unknown'}</td>
                        <td className="p-3">
                          <span className={`font-medium ${actionColor[a.action] || 'text-slate-300'}`}>
                            {a.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400">
                          <span className="text-xs">{a.target_type}</span>
                          {a.target_id && <span className="text-xs text-slate-600 font-mono ml-1">{a.target_id.slice(0, 8)}</span>}
                        </td>
                        <td className="p-3 text-xs text-slate-600 hidden lg:table-cell max-w-48 truncate">
                          {Object.keys(a.details).length > 0 ? JSON.stringify(a.details) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4 justify-center">
            <button onClick={() => setAuditPage(Math.max(0, auditPage - 1))} disabled={auditPage === 0} className="text-sm text-slate-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-white/5">← Prev</button>
            <span className="text-sm text-slate-500 py-1.5">Page {auditPage + 1}</span>
            <button onClick={() => setAuditPage(auditPage + 1)} disabled={audit.length < PAGE_SIZE} className="text-sm text-slate-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-white/5">Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
