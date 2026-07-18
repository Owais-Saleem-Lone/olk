"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { formatDistance } from '@/lib/geo'
import Link from 'next/link'
import Image from 'next/image'

type EventItem = {
  id: string
  club_id: string
  club_name?: string | null
  clubs?: { name: string } | null
  title: string
  description: string | null
  cover_url: string | null
  starts_at: string
  is_online: boolean
  location_name: string | null
  visibility: string
  attendee_count: number
  distance_km?: number | null
}

export default function EventsPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const mounted = useRef(false)

  const fetchEvents = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    let userLat: number | null = null
    let userLng: number | null = null

    if (user) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', user.id)
        .single()

      if (myProfile?.latitude && myProfile?.longitude) {
        userLat = myProfile.latitude
        userLng = myProfile.longitude
      }
    }

    let list: EventItem[] = []

    if (userLat && userLng) {
      const { data } = await supabase.rpc('get_events_nearby', {
        user_lat: userLat,
        user_lng: userLng,
      })
      if (data) list = data as EventItem[]
    } else {
      const { data } = await supabase
        .from('club_events')
        .select('id, club_id, title, description, cover_url, starts_at, is_online, location_name, visibility, attendee_count, clubs(name)')
        .eq('active', true)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
      if (data) {
        list = (data as unknown as EventItem[]).map(e => ({ ...e, club_name: e.clubs?.name }))
      }
    }

    if (onlineOnly) list = list.filter(e => e.is_online)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) || (e.club_name || '').toLowerCase().includes(q)
      )
    }

    setEvents(list)
    setLoading(false)
  }

  // Intentionally run once on mount; searchQuery updates on every keystroke and
  // search is otherwise triggered explicitly via handleSearch (same pattern as clubs/page.tsx).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useAsyncEffect(() => fetchEvents(), [])

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    queueMicrotask(() => fetchEvents())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineOnly])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchEvents()
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Events</h1>
      <p className="text-slate-400 mb-8">Upcoming meetups from clubs across the community</p>

      <form onSubmit={handleSearch} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search events or clubs..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
          />
          <label className="flex items-center gap-2 px-3 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={onlineOnly} onChange={e => setOnlineOnly(e.target.checked)} className="accent-brand-teal" />
            Online only
          </label>
          <button type="submit" className="bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm">
            Search
          </button>
        </div>
      </form>

      {loading && <p className="text-slate-400 text-center py-20">Loading events...</p>}

      {!loading && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">📅</div>
          <h2 className="text-xl font-semibold mb-2">No upcoming events</h2>
          <p className="text-slate-400 max-w-md">
            {searchQuery || onlineOnly
              ? 'No events match your search. Try different filters!'
              : 'Join a club and be the first to schedule a meetup.'}
          </p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(ev => (
            <Link
              key={ev.id}
              href={`/events/${ev.id}`}
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-brand-teal/30 transition-colors flex flex-col"
            >
              <div className="w-full h-32 bg-gradient-to-br from-brand-slate-light to-brand-slate overflow-hidden relative">
                {ev.cover_url ? (
                  <Image src={ev.cover_url} alt={ev.title} fill unoptimized sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">📅</div>
                )}
                {ev.visibility === 'members_only' && (
                  <div className="absolute top-2 left-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Members only
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 flex flex-col flex-1">
                <p className="text-base font-semibold text-white mb-1">{ev.title}</p>
                <p className="text-xs text-brand-teal-light mb-2">{ev.club_name || ev.clubs?.name}</p>
                {ev.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">{ev.description}</p>
                )}

                <div className="mt-auto pt-3 border-t border-white/5 text-xs text-slate-500 space-y-1">
                  <p>{new Date(ev.starts_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                  <p>
                    {ev.is_online ? '💻 Online' : ev.location_name ? `📍 ${ev.location_name}` : '📍 TBA'}
                    {ev.distance_km != null && (
                      <span className="ml-2 text-brand-teal-light font-medium">{formatDistance(ev.distance_km)}</span>
                    )}
                    {' · '}<span className="text-slate-300 font-medium">{ev.attendee_count}</span> going
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
