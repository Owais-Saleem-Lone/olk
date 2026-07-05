import 'server-only'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/lib/html-escape'
import { EMAIL_BRAND } from '@/lib/email-brand'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const NOTIFICATION_SUBJECTS: Record<string, string> = {
  book_requested: 'New book request on OLK',
  request_accepted: 'Your book request was accepted!',
  request_declined: 'Book request update',
  new_message: 'New message on OLK',
  handover_confirmed: 'Book handover confirmed',
  book_returned: 'Book has been returned',
  club_joined: 'New member in your club',
}

export async function sendNotificationEmail({
  userId,
  type,
  title,
}: {
  userId: string
  type: string
  title: string
}) {
  if (!resend) return

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
  const email = authUser?.user?.email
  if (!email) return

  const subject = NOTIFICATION_SUBJECTS[type] || 'Notification from OLK'
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'OLK <notifications@olkashmir.com>'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://olkashmir.com'

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: ${EMAIL_BRAND.bg}; color: ${EMAIL_BRAND.text}; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: linear-gradient(135deg, ${EMAIL_BRAND.tealGradientFrom}, ${EMAIL_BRAND.tealGradientTo}); padding: 8px 14px; border-radius: 8px; font-weight: bold; font-size: 14px; color: white;">OLK</div>
        </div>
        <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="font-size: 16px; line-height: 1.6; margin: 0; color: ${EMAIL_BRAND.cardText};">${escapeHtml(title)}</p>
        </div>
        <div style="text-align: center;">
          <a href="${siteUrl}/notifications" style="display: inline-block; background: ${EMAIL_BRAND.teal}; color: white; font-weight: 600; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-size: 14px;">View on OLK</a>
        </div>
        <p style="text-align: center; font-size: 12px; color: ${EMAIL_BRAND.textFaint}; margin-top: 24px;">Open Library Kashmir — Share a book, change a life.</p>
      </div>
    `,
  })

  if (error) {
    console.error('Resend error:', error)
  }
}
