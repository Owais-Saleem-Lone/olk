'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendNotificationEmail } from '@/lib/send-notification-email'

type NotificationPayload = {
  userId: string
  type: string
  title: string
  link?: string
}

export async function createNotification({ userId, type, title, link }: NotificationPayload) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Unauthorized')
  }

  // Cross-user notifications (e.g. "your request was accepted") are created
  // by the *other* party, so RLS (which now only allows auth.uid() = user_id
  // for regular users) would reject a same-session insert here. This action
  // is the trusted server-side gate for that: it confirms the caller is
  // authenticated, then writes with the service-role client.
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await supabaseAdmin.from('notifications').insert({
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
