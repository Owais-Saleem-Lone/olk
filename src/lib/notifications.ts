'use server'

import { createClient } from '@/lib/supabase/server'
import { sendNotificationEmail } from '@/lib/send-notification-email'

type NotificationPayload = {
  userId: string
  type: string
  title: string
  link?: string
}

export async function createNotification({ userId, type, title, link }: NotificationPayload) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Unauthorized')
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    link: link || '/notifications',
  })

  if (error) {
    throw error
  }

  try {
    await sendNotificationEmail({ userId, type, title })
  } catch (err) {
    console.error('Email notification failed:', err)
  }
}
