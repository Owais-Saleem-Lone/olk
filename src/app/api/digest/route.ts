import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!resend) {
    return Response.json({ error: 'Email service not configured' }, { status: 503 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: subscribers } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, area_name, latitude, longitude')
    .eq('email_digest', true)

  if (!subscribers || subscribers.length === 0) {
    return Response.json({ sent: 0 })
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: newBooks } = await supabaseAdmin
    .from('books')
    .select('title, author, listing_type, cover_url')
    .eq('status', 'available')
    .gte('created_at', oneWeekAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  if (!newBooks || newBooks.length === 0) {
    return Response.json({ sent: 0, reason: 'No new books this week' })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://olkashmir.com'
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'OLK <notifications@olkashmir.com>'

  const bookListHtml = newBooks.map(b => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <strong style="color: #f1f5f9;">${b.title}</strong>
        ${b.author ? `<br/><span style="color: #94a3b8; font-size: 13px;">by ${b.author}</span>` : ''}
        <br/><span style="color: #2dd4bf; font-size: 12px; font-weight: 600;">${b.listing_type === 'donate' ? 'Free' : 'Lend'}</span>
      </td>
    </tr>
  `).join('')

  let sent = 0

  for (const sub of subscribers) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(sub.id)
    const email = authUser?.user?.email
    if (!email) continue

    const name = sub.display_name?.split('@')[0] || 'Reader'

    await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: `${newBooks.length} new book${newBooks.length > 1 ? 's' : ''} on OLK this week`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f172a; color: #e2e8f0; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #2dd4bf, #0d9488); padding: 8px 14px; border-radius: 8px; font-weight: bold; font-size: 14px; color: white;">OLK</div>
          </div>
          <p style="font-size: 18px; font-weight: 600; margin: 0 0 4px; color: white;">Hey ${name}!</p>
          <p style="font-size: 14px; color: #94a3b8; margin: 0 0 20px;">Here's what's new on Open Library Kashmir this week:</p>
          <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 4px 16px;">
            <table style="width: 100%; border-collapse: collapse;">${bookListHtml}</table>
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <a href="${siteUrl}/browse" style="display: inline-block; background: #14b8a6; color: white; font-weight: 600; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-size: 14px;">Browse All Books</a>
          </div>
          <p style="text-align: center; font-size: 11px; color: #475569; margin-top: 24px;">
            You're receiving this because you have digest emails enabled.
            <a href="${siteUrl}/profile" style="color: #64748b;">Unsubscribe</a>
          </p>
        </div>
      `,
    })

    sent++
  }

  return Response.json({ sent, books: newBooks.length })
}
