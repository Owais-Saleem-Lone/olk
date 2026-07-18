'use server'

import { createClient } from '@/lib/supabase/server'
import { checkAdminAPI, type AdminRole, type AdminUser } from '@/lib/admin'
import { revalidatePath } from 'next/cache'

type ActionResult = { success: boolean; error?: string }
type AuditMeta = { targetType: string; targetId: string | null; details?: Record<string, unknown> }
type AdminActionCtx = { admin: AdminUser; supabase: Awaited<ReturnType<typeof createClient>> }

async function auditLog(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown> = {}
) {
  const supabase = await createClient()
  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  })
}

async function guardRole(minRole: AdminRole = 'moderator') {
  const admin = await checkAdminAPI(minRole)
  if (!admin) throw new Error('Unauthorized')
  return admin
}

// Collapses the guardRole -> createClient -> try/catch -> auditLog -> revalidatePath
// skeleton shared by every admin action below. `handler` does the action-specific
// work and returns what to record in the audit log.
function withAdminAction<Args extends unknown[]>(
  minRole: AdminRole,
  action: string,
  handler: (ctx: AdminActionCtx, ...args: Args) => Promise<AuditMeta>
): (...args: Args) => Promise<ActionResult> {
  return async (...args: Args) => {
    try {
      const admin = await guardRole(minRole)
      const supabase = await createClient()
      const { targetType, targetId, details } = await handler({ admin, supabase }, ...args)
      await auditLog(admin.id, action, targetType, targetId, details)
      revalidatePath('/admin')
      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }
}

// ═══════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════

export const banUser = withAdminAction(
  'moderator',
  'ban_user',
  async ({ admin, supabase }, userId: string, reason: string, isPermanent: boolean, durationDays?: number) => {
    const expiresAt = !isPermanent && durationDays
      ? new Date(Date.now() + durationDays * 86400000).toISOString()
      : null

    await supabase.from('user_bans').insert({
      user_id: userId,
      admin_id: admin.id,
      reason,
      is_permanent: isPermanent,
      expires_at: expiresAt,
    })

    await supabase.from('profiles').update({
      is_banned: true,
      ban_reason: reason,
      ban_expires_at: expiresAt,
    }).eq('id', userId)

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'admin',
      title: isPermanent
        ? 'Your account has been permanently suspended.'
        : `Your account has been suspended for ${durationDays} days.`,
      body: `Reason: ${reason}`,
      link: '/profile',
    })

    return { targetType: 'user', targetId: userId, details: { reason, isPermanent, durationDays } }
  }
)

export const unbanUser = withAdminAction(
  'moderator',
  'unban_user',
  async ({ admin, supabase }, userId: string) => {
    await supabase.from('profiles').update({
      is_banned: false,
      ban_reason: null,
      ban_expires_at: null,
    }).eq('id', userId)

    await supabase.from('user_bans')
      .update({ unbanned_at: new Date().toISOString(), unbanned_by: admin.id })
      .eq('user_id', userId)
      .is('unbanned_at', null)

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'admin',
      title: 'Your account has been restored.',
      link: '/profile',
    })

    return { targetType: 'user', targetId: userId }
  }
)

export const warnUser = withAdminAction(
  'moderator',
  'warn_user',
  async ({ admin, supabase }, userId: string, reason: string) => {
    await supabase.from('user_warnings').insert({
      user_id: userId,
      admin_id: admin.id,
      reason,
    })

    const { data: warnings } = await supabase
      .from('user_warnings')
      .select('id')
      .eq('user_id', userId)

    await supabase.from('profiles')
      .update({ warning_count: warnings?.length ?? 0 })
      .eq('id', userId)

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'admin',
      title: 'You have received an official warning.',
      body: `Reason: ${reason}`,
      link: '/profile',
    })

    return { targetType: 'user', targetId: userId, details: { reason } }
  }
)

export const resetUserProfile = withAdminAction(
  'moderator',
  'reset_profile',
  async ({ supabase }, userId: string, field: 'display_name' | 'area_name') => {
    await supabase.from('profiles')
      .update({ [field]: null })
      .eq('id', userId)

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'admin',
      title: `Your ${field === 'display_name' ? 'display name' : 'area'} has been reset by an admin.`,
      link: '/profile',
    })

    return { targetType: 'user', targetId: userId, details: { field } }
  }
)

export const setAdminRole = withAdminAction(
  'super_admin',
  'set_admin_role',
  async ({ supabase }, userId: string, role: AdminRole | null) => {
    if (role) {
      await supabase.from('profiles')
        .update({ is_admin: true, admin_role: role })
        .eq('id', userId)
    } else {
      await supabase.from('profiles')
        .update({ is_admin: false, admin_role: null })
        .eq('id', userId)
    }

    return { targetType: 'user', targetId: userId, details: { role } }
  }
)

// ═══════════════════════════════════════════
// BOOK MANAGEMENT
// ═══════════════════════════════════════════

export const hideBook = withAdminAction(
  'moderator',
  'hide_book',
  async ({ supabase }, bookId: string, reason: string) => {
    const { data: book } = await supabase
      .from('books')
      .select('owner_id, title')
      .eq('id', bookId)
      .single()

    await supabase.from('books').update({
      hidden_by_admin: true,
      admin_hide_reason: reason,
      hidden_at: new Date().toISOString(),
      status: 'unavailable',
    }).eq('id', bookId)

    if (book?.owner_id) {
      await supabase.from('notifications').insert({
        user_id: book.owner_id,
        type: 'admin',
        title: `Your listing "${book.title}" has been hidden by an admin.`,
        body: `Reason: ${reason}`,
        link: '/my-books',
      })
    }

    return { targetType: 'book', targetId: bookId, details: { reason } }
  }
)

export const unhideBook = withAdminAction(
  'moderator',
  'unhide_book',
  async ({ supabase }, bookId: string) => {
    await supabase.from('books').update({
      hidden_by_admin: false,
      admin_hide_reason: null,
      hidden_at: null,
      status: 'available',
    }).eq('id', bookId)

    return { targetType: 'book', targetId: bookId }
  }
)

export const editBook = withAdminAction(
  'moderator',
  'edit_book',
  async ({ supabase }, bookId: string, updates: { title?: string; author?: string; genre?: string }) => {
    await supabase.from('books').update(updates).eq('id', bookId)
    return { targetType: 'book', targetId: bookId, details: updates }
  }
)

export const bulkHideBooks = withAdminAction(
  'moderator',
  'bulk_hide_books',
  async ({ supabase }, bookIds: string[], reason: string) => {
    await supabase.from('books').update({
      hidden_by_admin: true,
      admin_hide_reason: reason,
      hidden_at: new Date().toISOString(),
      status: 'unavailable',
    }).in('id', bookIds)

    return { targetType: 'book', targetId: null, details: { bookIds, reason } }
  }
)

// ═══════════════════════════════════════════
// REQUEST MANAGEMENT
// ═══════════════════════════════════════════

export const cancelRequest = withAdminAction(
  'moderator',
  'cancel_request',
  async ({ supabase }, requestId: string, reason: string) => {
    const { data: req } = await supabase
      .from('book_requests')
      .select('requester_id, book_id, books(owner_id, title, status)')
      .eq('id', requestId)
      .single()

    await supabase.from('book_requests')
      .update({ status: 'declined' })
      .eq('id', requestId)

    if (req?.book_id) {
      await supabase.from('books')
        .update({ status: 'available' })
        .eq('id', req.book_id)
    }

    const bookData = req?.books as unknown as { owner_id: string; title: string; status: string } | null
    const usersToNotify = new Set([req?.requester_id, bookData?.owner_id].filter(Boolean) as string[])
    for (const uid of usersToNotify) {
      await supabase.from('notifications').insert({
        user_id: uid,
        type: 'admin',
        title: `A book request has been cancelled by an admin.`,
        body: `Reason: ${reason}`,
        link: '/requests',
      })
    }

    return { targetType: 'request', targetId: requestId, details: { reason } }
  }
)

export const forceReturnBook = withAdminAction(
  'moderator',
  'force_return',
  async ({ supabase }, requestId: string) => {
    await supabase.from('book_requests').update({
      status: 'returned',
      completed_at: new Date().toISOString(),
    }).eq('id', requestId)

    const { data: req } = await supabase
      .from('book_requests')
      .select('book_id')
      .eq('id', requestId)
      .single()

    if (req?.book_id) {
      await supabase.from('books')
        .update({ status: 'available' })
        .eq('id', req.book_id)
    }

    return { targetType: 'request', targetId: requestId }
  }
)

// ═══════════════════════════════════════════
// REPORTS & MODERATION
// ═══════════════════════════════════════════

export const updateReportStatus = withAdminAction(
  'moderator',
  'update_report',
  async ({ admin, supabase }, reportId: string, status: string) => {
    const updates: Record<string, unknown> = { status }
    if (status === 'resolved' || status === 'dismissed') {
      updates.resolved_at = new Date().toISOString()
      updates.resolved_by = admin.id
    }

    await supabase.from('reports').update(updates).eq('id', reportId)
    return { targetType: 'report', targetId: reportId, details: { status } }
  }
)

export const assignReport = withAdminAction(
  'moderator',
  'assign_report',
  async ({ supabase }, reportId: string, assigneeId: string) => {
    await supabase.from('reports').update({ assigned_to: assigneeId }).eq('id', reportId)
    return { targetType: 'report', targetId: reportId, details: { assigneeId } }
  }
)

export const addAdminNote = withAdminAction(
  'moderator',
  'add_note',
  async ({ admin, supabase }, reportId: string, content: string) => {
    await supabase.from('admin_notes').insert({
      report_id: reportId,
      admin_id: admin.id,
      content,
    })

    return { targetType: 'report', targetId: reportId }
  }
)

export const updateReportCategory = withAdminAction(
  'moderator',
  'categorize_report',
  async ({ supabase }, reportId: string, category: string) => {
    await supabase.from('reports').update({ category }).eq('id', reportId)
    return { targetType: 'report', targetId: reportId, details: { category } }
  }
)

// ═══════════════════════════════════════════
// CLUB MANAGEMENT
// ═══════════════════════════════════════════

export const deactivateClub = withAdminAction(
  'moderator',
  'deactivate_club',
  async ({ supabase }, clubId: string) => {
    await supabase.from('clubs').update({ active: false }).eq('id', clubId)
    return { targetType: 'club', targetId: clubId }
  }
)

export const reactivateClub = withAdminAction(
  'moderator',
  'reactivate_club',
  async ({ supabase }, clubId: string) => {
    await supabase.from('clubs').update({ active: true }).eq('id', clubId)
    return { targetType: 'club', targetId: clubId }
  }
)

export const removeClubMember = withAdminAction(
  'moderator',
  'remove_club_member',
  async ({ supabase }, clubId: string, userId: string) => {
    await supabase.from('club_members')
      .delete()
      .eq('club_id', clubId)
      .eq('user_id', userId)

    return { targetType: 'club', targetId: clubId, details: { userId } }
  }
)

export const transferClubOwnership = withAdminAction(
  'super_admin',
  'transfer_club',
  async ({ supabase }, clubId: string, newOwnerId: string) => {
    await supabase.from('clubs').update({ creator_id: newOwnerId }).eq('id', clubId)
    return { targetType: 'club', targetId: clubId, details: { newOwnerId } }
  }
)

// ═══════════════════════════════════════════
// EVENT MANAGEMENT
// ═══════════════════════════════════════════

export const deactivateEvent = withAdminAction(
  'moderator',
  'deactivate_event',
  async ({ supabase }, eventId: string) => {
    await supabase.from('club_events').update({ active: false }).eq('id', eventId)
    return { targetType: 'event', targetId: eventId }
  }
)

export const reactivateEvent = withAdminAction(
  'moderator',
  'reactivate_event',
  async ({ supabase }, eventId: string) => {
    await supabase.from('club_events').update({ active: true }).eq('id', eventId)
    return { targetType: 'event', targetId: eventId }
  }
)

// ═══════════════════════════════════════════
// CONTENT MANAGEMENT
// ═══════════════════════════════════════════

export const createAnnouncement = withAdminAction(
  'moderator',
  'create_announcement',
  async ({ admin, supabase }, data: {
    title: string
    body?: string
    type: string
    isBanner: boolean
    endsAt?: string
  }) => {
    if (data.isBanner) {
      await supabase.from('announcements')
        .update({ is_banner: false })
        .eq('is_banner', true)
    }

    await supabase.from('announcements').insert({
      admin_id: admin.id,
      title: data.title,
      body: data.body || null,
      type: data.type,
      is_banner: data.isBanner,
      ends_at: data.endsAt || null,
    })

    return { targetType: 'announcement', targetId: null, details: data }
  }
)

export const deleteAnnouncement = withAdminAction(
  'moderator',
  'delete_announcement',
  async ({ supabase }, id: string) => {
    await supabase.from('announcements').delete().eq('id', id)
    return { targetType: 'announcement', targetId: id }
  }
)

export const manageGenre = withAdminAction(
  'moderator',
  'genre_manage',
  async ({ supabase }, action: 'add' | 'toggle', name: string, active?: boolean) => {
    if (action === 'add') {
      await supabase.from('genres').insert({ name, active: true })
    } else {
      await supabase.from('genres').update({ active: active ?? false }).eq('name', name)
    }

    return { targetType: 'genre', targetId: null, details: { action, name, active } }
  }
)

export const manageArea = withAdminAction(
  'moderator',
  'area_manage',
  async ({ supabase }, action: 'add' | 'toggle', name: string, district?: string, active?: boolean) => {
    if (action === 'add') {
      await supabase.from('areas').insert({ name, district: district || null, active: true })
    } else {
      await supabase.from('areas').update({ active: active ?? false }).eq('name', name)
    }

    return { targetType: 'area', targetId: null, details: { action, name, district, active } }
  }
)

export const saveBotm = withAdminAction(
  'moderator',
  'set_botm',
  async ({ supabase }, data: {
    title: string
    author?: string
    description?: string
    coverUrl?: string
    monthLabel?: string
  }) => {
    await supabase.from('book_of_month')
      .update({ active: false })
      .eq('active', true)

    await supabase.from('book_of_month').insert({
      title: data.title,
      author: data.author || null,
      description: data.description || null,
      cover_url: data.coverUrl || null,
      month_label: data.monthLabel || null,
      active: true,
    })

    return { targetType: 'botm', targetId: null, details: data }
  }
)

// ═══════════════════════════════════════════
// NOTIFICATIONS & COMMUNICATION
// ═══════════════════════════════════════════

export const sendBroadcastNotification = withAdminAction(
  'moderator',
  'broadcast_notification',
  async ({ supabase }, title: string, body?: string, link?: string, filterArea?: string) => {
    let query = supabase.from('profiles').select('id')
    if (filterArea) {
      query = query.eq('area_name', filterArea)
    }
    const { data: users } = await query

    if (users && users.length > 0) {
      const notifications = users.map(u => ({
        user_id: u.id,
        type: 'admin_broadcast',
        title,
        body: body || null,
        link: link || '/notifications',
      }))
      await supabase.from('notifications').insert(notifications)
    }

    return {
      targetType: 'notification',
      targetId: null,
      details: { title, recipientCount: users?.length ?? 0, filterArea },
    }
  }
)

export const sendDirectNotification = withAdminAction(
  'moderator',
  'direct_notification',
  async ({ supabase }, userId: string, title: string, body?: string) => {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'admin',
      title,
      body: body || null,
      link: '/notifications',
    })

    return { targetType: 'notification', targetId: userId, details: { title } }
  }
)

// ═══════════════════════════════════════════
// PLATFORM SETTINGS
// ═══════════════════════════════════════════

export const updatePlatformSetting = withAdminAction(
  'super_admin',
  'update_setting',
  async ({ admin, supabase }, key: string, value: string) => {
    await supabase.from('platform_settings')
      .update({ value: JSON.stringify(value), updated_at: new Date().toISOString(), updated_by: admin.id })
      .eq('key', key)

    return { targetType: 'setting', targetId: null, details: { key, value } }
  }
)
