'use server'

import { after } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendNotificationEmail, sendBatchNotificationEmails } from '@/lib/send-notification-email'

type NotificationContext =
  | { kind: 'request'; id: string }
  | { kind: 'club_join'; id: string }
  | { kind: 'club_membership_approved'; id: string }
  | { kind: 'club_announcement'; id: string }
  | { kind: 'event_created'; id: string }
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

// Fan-out for "everyone in this club" events (a new chat message, a new
// event) used to be a client-driven loop calling createNotification() once
// per member -- N sequential round trips (auth check + can_notify RPC +
// insert + blocking email) that scaled linearly with club size and risked
// timing out the request on a large club. notify_club_chat_message /
// notify_event_created do the whole fan-out server-side in one bulk
// INSERT...SELECT (authorization check included, same posture as
// can_notify), so this is now a single round trip regardless of member
// count. Email delivery is scheduled via after() so it runs once the
// response has already been sent back to the poster/organizer, and is
// batched+concurrency-limited in sendBatchNotificationEmails so it can't
// blow past provider rate limits or hang the function indefinitely.

type NotifyRecipient = { user_id: string; title: string }

export async function notifyClubChatMessage(postId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: recipients, error } = await supabase.rpc('notify_club_chat_message', { p_post_id: postId })
  if (error) throw error

  const items = ((recipients || []) as NotifyRecipient[]).map(r => ({ userId: r.user_id, type: 'club_announcement', title: r.title }))
  after(() => sendBatchNotificationEmails(items))
}

export async function notifyEventCreated(eventId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: recipients, error } = await supabase.rpc('notify_event_created', { p_event_id: eventId })
  if (error) throw error

  const items = ((recipients || []) as NotifyRecipient[]).map(r => ({ userId: r.user_id, type: 'event_created', title: r.title }))
  after(() => sendBatchNotificationEmails(items))
}
