'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { deactivateEvent, reactivateEvent } from '@/lib/admin-actions'

type EventRow = {
  id: string
  title: string
  starts_at: string
  is_online: boolean
  location_name: string | null
  visibility: string
  attendee_count: number
  active: boolean
  club: { id: string; name: string } | null
  creator: { id: string; display_name: string | null } | null
}

type Attendee = {
  user_id: string
  created_at: string
  user: { display_name: string | null } | null
}

export default function AdminEventsPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [selected, setSelected] = useState<EventRow | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('club_events')
      .select('id, title, starts_at, is_online, location_name, visibility, attendee_count, active, club:club_id(id, name), creator:creator_id(id, display_name)')
      .order('starts_at', { ascending: false })

    if (filter === 'active') query = query.eq('active', true)
    if (filter === 'inactive') query = query.eq('active', false)

    const { data } = await query
    setEvents((data || []) as unknown as EventRow[])
    setLoading(false)
  }, [supabase, filter])

  useAsyncEffect(() => loadEvents(), [loadEvents])

  async function selectEvent(event: EventRow) {
    setSelected(event)
    const { data } = await supabase
      .from('event_rsvps')
      .select('user_id, created_at, user:user_id(display_name)')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true })
    setAttendees((data || []) as unknown as Attendee[])
  }

  async function handleToggleActive(event: EventRow) {
    setActing(true)
    const res = event.active ? await deactivateEvent(event.id) : await reactivateEvent(event.id)
    setActing(false)
    if (res.success) { setMsg(event.active ? 'Event deactivated' : 'Event reactivated'); setSelected(null); loadEvents() }
  }

  return (
    <div>
      {msg && (
        <div className="mb-4 bg-brand-teal/10 border border-brand-teal/20 text-brand-teal-light text-sm px-4 py-2 rounded-lg flex justify-between">
          {msg}<button onClick={() => setMsg('')} className="text-brand-teal-light/50 hover:text-brand-teal-light">×</button>
        </div>
      )}

      <div className="flex gap-1 mb-4">
        {(['active', 'inactive', 'all'] as const).map(f => (
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
          ) : events.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No events found</p>
          ) : (
            events.map(e => (
              <button
                key={e.id}
                onClick={() => selectEvent(e)}
                className={`w-full text-left bg-white/[0.03] border rounded-xl p-4 transition-colors ${
                  selected?.id === e.id ? 'border-brand-teal/30 bg-brand-teal/5' : 'border-white/[0.06] hover:bg-white/[0.05]'
                } ${!e.active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {e.title}
                      {!e.active && <span className="ml-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">Inactive</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {e.club?.name || 'Unknown club'} · {new Date(e.starts_at).toLocaleDateString()} · {e.attendee_count} going
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
                  <h3 className="text-lg font-semibold text-white">{selected.title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{selected.club?.name}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-lg">×</button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center py-2 bg-white/[0.03] rounded-lg">
                  <p className="text-lg font-bold text-white">{selected.attendee_count}</p>
                  <p className="text-xs text-slate-500">Going</p>
                </div>
                <div className="text-center py-2 bg-white/[0.03] rounded-lg">
                  <p className="text-sm text-slate-300">{selected.visibility === 'public' ? 'Public' : 'Members only'}</p>
                  <p className="text-xs text-slate-500">Visibility</p>
                </div>
                <div className="text-center py-2 bg-white/[0.03] rounded-lg">
                  <p className="text-sm text-slate-300">{selected.is_online ? 'Online' : (selected.location_name || '—')}</p>
                  <p className="text-xs text-slate-500">Location</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-4">
                Organized by {selected.creator?.display_name || 'Unknown'} · {new Date(selected.starts_at).toLocaleString()}
              </p>

              <button
                onClick={() => handleToggleActive(selected)}
                disabled={acting}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                  selected.active
                    ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                    : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
                }`}
              >
                {selected.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>

            {/* Attendees list */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <p className="text-sm font-medium text-slate-300 mb-3">Attendees ({attendees.length})</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {attendees.length === 0 ? (
                  <p className="text-xs text-slate-600">No RSVPs yet</p>
                ) : attendees.map(a => (
                  <div key={a.user_id} className="flex items-center justify-between py-2 px-3 bg-white/[0.02] rounded-lg">
                    <p className="text-sm text-white">{a.user?.display_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-600">{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
