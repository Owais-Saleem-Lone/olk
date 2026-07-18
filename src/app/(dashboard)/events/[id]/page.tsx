"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { toast } from '@/hooks/use-toast'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import ConfirmModal from '@/components/confirm-modal'

type EventDetail = {
  id: string
  club_id: string
  creator_id: string
  title: string
  description: string | null
  cover_url: string | null
  starts_at: string
  ends_at: string | null
  is_online: boolean
  location_name: string | null
  meeting_url: string | null
  visibility: string
  capacity: number | null
  attendee_count: number
  clubs: { name: string } | null
}

type Attendee = {
  user_id: string
  profiles: { display_name: string | null } | null
}

export default function EventDetailPage() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [creatorName, setCreatorName] = useState('')
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [showAttendees, setShowAttendees] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [isClubMember, setIsClubMember] = useState(false)
  const [isGoing, setIsGoing] = useState(false)
  const [rsvping, setRsvping] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const fetchEvent = useCallback(async () => {
    setLoading(true)

    const { data: eventData } = await supabase
      .from('club_events')
      .select('*, clubs(name)')
      .eq('id', eventId)
      .single()

    if (!eventData) { setNotFound(true); setLoading(false); return }
    setEvent(eventData as unknown as EventDetail)

    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', eventData.creator_id)
      .single()
    setCreatorName(creatorProfile?.display_name || 'Anonymous')

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      setIsCreator(user.id === eventData.creator_id)

      const { data: membership } = await supabase
        .from('club_members')
        .select('id')
        .eq('club_id', eventData.club_id)
        .eq('user_id', user.id)
        .maybeSingle()
      setIsClubMember(!!membership)

      const { data: myRsvp } = await supabase
        .from('event_rsvps')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle()
      setIsGoing(!!myRsvp)
    }

    const { data: attendeeData } = await supabase
      .from('event_rsvps')
      .select('user_id, profiles(display_name)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
    if (attendeeData) setAttendees(attendeeData as unknown as Attendee[])

    setLoading(false)
  }, [supabase, eventId])

  useAsyncEffect(() => fetchEvent(), [fetchEvent])

  const canRsvp = event?.visibility === 'public' || isClubMember || isCreator
  const isFull = !!event?.capacity && event.attendee_count >= event.capacity && !isGoing

  const handleRsvp = async () => {
    if (!currentUserId || !event || rsvping) return
    setRsvping(true)

    if (isGoing) {
      await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', currentUserId)
      setIsGoing(false)
      setEvent(prev => prev ? { ...prev, attendee_count: Math.max(0, prev.attendee_count - 1) } : prev)
      setAttendees(prev => prev.filter(a => a.user_id !== currentUserId))
    } else {
      const { error } = await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: currentUserId })
      if (error) {
        toast.error(error.code === '23505' ? 'You are already going' : 'Could not RSVP: ' + error.message)
        setRsvping(false)
        return
      }
      setIsGoing(true)
      setEvent(prev => prev ? { ...prev, attendee_count: prev.attendee_count + 1 } : prev)
      fetchEvent()
    }
    setRsvping(false)
  }

  const handleCancelEvent = async () => {
    setConfirmingCancel(false)
    await supabase.from('club_events').update({ active: false }).eq('id', eventId)
    router.push(`/clubs/${event?.club_id}`)
  }

  if (loading) return <p className="text-slate-400 text-center py-20">Loading event...</p>

  if (notFound || !event) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📅</div>
        <h2 className="text-xl font-semibold mb-2">Event not found</h2>
        <Link href="/events" className="text-brand-teal-light hover:text-teal-300 text-sm">← Back to Events</Link>
      </div>
    )
  }

  const startsLabel = new Date(event.starts_at).toLocaleString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  })
  const endsLabel = event.ends_at
    ? new Date(event.ends_at).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden mb-8">
        {event.cover_url && (
          <div className="relative w-full h-48 overflow-hidden">
            <Image src={event.cover_url} alt={event.title} fill unoptimized sizes="100vw" className="object-cover" referrerPolicy="no-referrer" />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <p className="text-sm text-brand-teal-light mb-1">
                <Link href={`/clubs/${event.club_id}`} className="hover:text-teal-300">{event.clubs?.name}</Link>
              </p>
              <h1 className="text-2xl font-bold">{event.title}</h1>
            </div>
            {event.visibility === 'members_only' && (
              <span className="flex-shrink-0 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">Members only</span>
            )}
          </div>

          {event.description && <p className="text-slate-400 text-sm mb-4 whitespace-pre-wrap">{event.description}</p>}

          <div className="space-y-1.5 text-sm text-slate-300 mb-5">
            <p>🗓️ {startsLabel}{endsLabel ? ` – ${endsLabel}` : ''}</p>
            <p>{event.is_online ? '💻 Online event' : `📍 ${event.location_name || 'Location TBA'}`}</p>
            <p>👤 Organized by <Link href={`/user/${event.creator_id}`} className="text-brand-teal-light hover:text-teal-300">{creatorName}</Link></p>
            {event.capacity && <p>🎟️ {event.attendee_count} / {event.capacity} spots filled</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!currentUserId ? (
              <Link href="/login" className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
                Login to RSVP
              </Link>
            ) : !canRsvp ? (
              <Link href={`/clubs/${event.club_id}`} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
                Join the club to RSVP
              </Link>
            ) : (
              <button
                onClick={handleRsvp}
                disabled={rsvping || isFull}
                className={`font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-40 ${
                  isGoing
                    ? 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300'
                    : 'bg-brand-teal hover:bg-brand-teal-light text-white'
                }`}
              >
                {isFull ? 'Event full' : isGoing ? "Cancel RSVP" : "I'm going"}
              </button>
            )}

            {event.is_online && event.meeting_url && (isGoing || isCreator) && (
              <a href={event.meeting_url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-teal-light hover:text-teal-300">
                Join meeting link →
              </a>
            )}

            <a href={`/api/events/${eventId}/ics`} className="text-sm text-slate-400 hover:text-white transition-colors">
              📆 Add to calendar
            </a>

            {isCreator && (
              <button onClick={() => setConfirmingCancel(true)} className="text-sm text-red-400/70 hover:text-red-400 transition-colors ml-auto">
                Cancel Event
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <button onClick={() => setShowAttendees(!showAttendees)} className="flex items-center justify-between w-full text-xl font-semibold mb-4">
          <span>Going ({event.attendee_count})</span>
          <span className="text-slate-500 text-sm">{showAttendees ? '▲' : '▼'}</span>
        </button>

        {showAttendees && (
          attendees.length === 0 ? (
            <p className="text-sm text-slate-500">No one has RSVP&apos;d yet.</p>
          ) : (
            <div className="space-y-2">
              {attendees.map(a => (
                <Link
                  key={a.user_id}
                  href={`/user/${a.user_id}`}
                  className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 hover:border-brand-teal/20 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-brand-teal-light font-bold text-sm flex-shrink-0">
                    {(a.profiles?.display_name || '?')[0].toUpperCase()}
                  </div>
                  <p className="text-sm text-white font-medium">{a.profiles?.display_name || 'Anonymous'}</p>
                </Link>
              ))}
            </div>
          )
        )}
      </div>

      <div className="mt-8">
        <Link href="/events" className="text-sm text-slate-400 hover:text-brand-teal-light transition-colors">← Back to Events</Link>
      </div>

      {confirmingCancel && (
        <ConfirmModal
          title="Cancel this event?"
          message="This cannot be undone. Attendees will no longer see it."
          confirmLabel="Cancel Event"
          onConfirm={handleCancelEvent}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </div>
  )
}
