import { createClient } from '@/lib/supabase/server'

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('club_events')
    .select('id, title, description, starts_at, ends_at, is_online, location_name, meeting_url, clubs(name)')
    .eq('id', id)
    .eq('active', true)
    .single()

  if (!event) {
    return Response.json({ error: 'Event not found' }, { status: 404 })
  }

  const club = event.clubs as unknown as { name: string } | null
  const dtStart = toIcsDate(event.starts_at)
  const dtEnd = toIcsDate(event.ends_at || new Date(new Date(event.starts_at).getTime() + 3600000).toISOString())
  const location = event.is_online ? (event.meeting_url || 'Online') : (event.location_name || '')
  const description = [event.description, club ? `Hosted by ${club.name}` : null].filter(Boolean).join('\n\n')

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OLK//Club Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@olkashmir.com`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(event.title)}`,
    description ? `DESCRIPTION:${icsEscape(description)}` : null,
    location ? `LOCATION:${icsEscape(location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="event-${event.id}.ics"`,
    },
  })
}
