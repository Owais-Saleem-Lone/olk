'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendNotificationEmail } from '@/lib/send-notification-email'

type NotificationContext =
  | { kind: 'request'; id: string }
  | { kind: 'club_join'; id: string }
  | { kind: 'club_announcement'; id: string }
  | { kind: 'wishlist_match'; id: string }

type NotificationPayload = {
  userId: string
  type: string
  title: string
  link?: string
  context: NotificationContext
}

export async function createNotification({ userId, type, title, link, context }: NotificationPayload) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Unauthorized')
  }

  // Cross-user notifications (e.g. "your request was accepted") are created
  // by the *other* party, so RLS (which now only allows auth.uid() = user_id
  // for regular users) would reject a same-session insert here. Before using
  // the service-role client to bypass that, verify server-side (via a
  // SECURITY DEFINER RPC) that the caller actually has the claimed
  // relationship to userId for this context — never trust the client-supplied
  // userId/type on their own.
  const { data: allowed, error: guardError } = await supabase.rpc('can_notify', {
    p_target_user: userId,
    p_context_type: context.kind,
    p_context_id: context.id,
  })
  if (guardError || !allowed) {
    throw new Error('Forbidden: no valid relationship to notify this user')
  }

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
