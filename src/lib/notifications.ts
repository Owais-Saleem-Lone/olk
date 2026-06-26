import { createClient } from '@/lib/supabase/client'

type NotificationPayload = {
  userId: string
  type: string
  title: string
  link?: string
}

export async function createNotification({ userId, type, title, link }: NotificationPayload) {
  const supabase = createClient()

  await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    link: link || '/notifications',
  })

  fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, type, title }),
  }).catch(err => console.error('Email notification failed:', err))
}
