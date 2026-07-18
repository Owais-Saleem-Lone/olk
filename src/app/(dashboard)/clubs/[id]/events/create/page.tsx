"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { createNotification } from '@/lib/notifications'
import { compressImage } from '@/lib/image-utils'
import { toast } from '@/hooks/use-toast'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import CoverInput from '@/components/my-books/cover-input'

// Kept outside the component: Date.now() is an impure call the React
// Compiler's purity check flags wherever it's written, even though this one
// only ever runs from an upload event handler, never during render.
function timestampedPath(userId: string, ext: string | undefined) {
  return `${userId}/${Date.now()}.${ext}`
}

export default function CreateClubEventPage() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const clubId = params.id as string

  const [loading, setLoading] = useState(true)
  const [clubName, setClubName] = useState('')
  const [isCreator, setIsCreator] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isOnline, setIsOnline] = useState(false)
  const [locationName, setLocationName] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'members_only'>('public')
  const [capacity, setCapacity] = useState('')
  const [creating, setCreating] = useState(false)

  const loadClub = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)

    const { data: club } = await supabase
      .from('clubs')
      .select('name, creator_id')
      .eq('id', clubId)
      .single()

    if (club) {
      setClubName(club.name)
      setIsCreator(!!user && user.id === club.creator_id)
    }
    setLoading(false)
  }, [supabase, clubId])

  useAsyncEffect(() => loadClub(), [loadClub])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be smaller than 5MB'); return }
    setCoverFile(file)
    setCoverUrl('')
    const reader = new FileReader()
    reader.onload = (ev) => setCoverPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const uploadCover = async (file: File, userId: string) => {
    const compressed = await compressImage(file)
    const ext = compressed.name.split('.').pop()
    const path = timestampedPath(userId, ext)
    const { error } = await supabase.storage.from('event-covers').upload(path, compressed)
    if (error) return { url: null, error: error.message }
    const { data } = supabase.storage.from('event-covers').getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !startsAt || !currentUserId || creating) return
    setCreating(true)

    let finalCoverUrl: string | null = coverUrl.trim() || null
    if (coverFile) {
      const { url, error } = await uploadCover(coverFile, currentUserId)
      if (error) { toast.error('Cover upload failed: ' + error); setCreating(false); return }
      finalCoverUrl = url
    }

    const { data: event, error } = await supabase.from('club_events').insert({
      club_id: clubId,
      creator_id: currentUserId,
      title: title.trim(),
      description: description.trim() || null,
      cover_url: finalCoverUrl,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      is_online: isOnline,
      location_name: !isOnline ? (locationName.trim() || null) : null,
      meeting_url: isOnline ? (meetingUrl.trim() || null) : null,
      visibility,
      capacity: capacity ? parseInt(capacity, 10) : null,
    }).select().single()

    if (error) {
      toast.error('Error creating event: ' + error.message)
      setCreating(false)
      return
    }

    const { data: members } = await supabase
      .from('club_members')
      .select('user_id')
      .eq('club_id', clubId)

    const memberIds = (members || []).map(m => m.user_id).filter(id => id !== currentUserId)
    for (const id of memberIds) {
      await createNotification({
        userId: id,
        type: 'event_created',
        title: `New event in "${clubName}": ${event.title}`,
        link: `/events/${event.id}`,
        context: { kind: 'event_created', id: event.id },
      })
    }

    router.push(`/events/${event.id}`)
  }

  if (loading) return <p className="text-slate-400 text-center py-20">Loading...</p>

  if (!isCreator) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="text-5xl mb-4">📅</div>
        <h1 className="text-2xl font-bold mb-3">Only the club creator can schedule events</h1>
        <p className="text-sm text-slate-400 mb-6">Ask the organizer of &quot;{clubName}&quot; to create this event.</p>
        <Link href={`/clubs/${clubId}`} className="text-sm text-brand-teal-light hover:text-teal-300">← Back to {clubName || 'club'}</Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-2">Create an Event</h1>
      <p className="text-slate-400 mb-8">Schedule a meetup for &quot;{clubName}&quot;</p>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Event Title</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              placeholder="e.g., Monthly Book Discussion" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
              placeholder="What will happen at this event?" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Cover Image <span className="text-slate-500 font-normal">(optional)</span></label>
            <CoverInput
              preview={coverPreview}
              onFileChange={handleFileChange}
              onUrlChange={(v) => { setCoverUrl(v); setCoverFile(null); setCoverPreview(v) }}
              urlValue={coverUrl}
              onClear={() => { setCoverFile(null); setCoverUrl(''); setCoverPreview('') }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Starts</label>
              <input type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Ends <span className="text-slate-500 font-normal">(optional)</span></label>
              <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input type="checkbox" checked={isOnline} onChange={e => setIsOnline(e.target.checked)} className="accent-brand-teal" />
              <span className="text-sm text-slate-300">This is an online event</span>
            </label>
            {isOnline ? (
              <input type="url" value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                placeholder="Meeting link (e.g., https://meet.google.com/...)" />
            ) : (
              <input type="text" value={locationName} onChange={e => setLocationName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                placeholder="Venue (e.g., Cafe Fiction, Anantnag)" />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Who can RSVP?</label>
            <select value={visibility} onChange={e => setVisibility(e.target.value as 'public' | 'members_only')}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
              <option value="public" className="bg-brand-slate">Anyone (public event)</option>
              <option value="members_only" className="bg-brand-slate">Club members only</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Everyone can still see this event exists — this only controls who can RSVP.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Capacity <span className="text-slate-500 font-normal">(optional)</span></label>
            <input type="number" min="1" value={capacity} onChange={e => setCapacity(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              placeholder="Max attendees" />
          </div>

          <button type="submit" disabled={creating || !title.trim() || !startsAt}
            className="w-full bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors">
            {creating ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      </div>
    </div>
  )
}
