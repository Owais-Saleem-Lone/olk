'use server'

import { createClient } from '@/lib/supabase/server'
import { checkAdminAPI, type AdminRole } from '@/lib/admin'
import { revalidatePath } from 'next/cache'

type ActionResult = { success: boolean; error?: string }

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

// ═══════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════

export async function banUser(
  userId: string,
  reason: string,
  isPermanent: boolean,
  durationDays?: number
): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'ban_user', 'user', userId, { reason, isPermanent, durationDays })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function unbanUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'unban_user', 'user', userId)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function warnUser(userId: string, reason: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'warn_user', 'user', userId, { reason })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function resetUserProfile(userId: string, field: 'display_name' | 'area_name'): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('profiles')
      .update({ [field]: null })
      .eq('id', userId)

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'admin',
      title: `Your ${field === 'display_name' ? 'display name' : 'area'} has been reset by an admin.`,
      link: '/profile',
    })

    await auditLog(admin.id, 'reset_profile', 'user', userId, { field })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function setAdminRole(userId: string, role: AdminRole | null): Promise<ActionResult> {
  try {
    const admin = await guardRole('super_admin')
    const supabase = await createClient()

    if (role) {
      await supabase.from('profiles')
        .update({ is_admin: true, admin_role: role })
        .eq('id', userId)
    } else {
      await supabase.from('profiles')
        .update({ is_admin: false, admin_role: null })
        .eq('id', userId)
    }

    await auditLog(admin.id, 'set_admin_role', 'user', userId, { role })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════
// BOOK MANAGEMENT
// ═══════════════════════════════════════════

export async function hideBook(bookId: string, reason: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'hide_book', 'book', bookId, { reason })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function unhideBook(bookId: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('books').update({
      hidden_by_admin: false,
      admin_hide_reason: null,
      hidden_at: null,
      status: 'available',
    }).eq('id', bookId)

    await auditLog(admin.id, 'unhide_book', 'book', bookId)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function editBook(
  bookId: string,
  updates: { title?: string; author?: string; genre?: string }
): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('books').update(updates).eq('id', bookId)
    await auditLog(admin.id, 'edit_book', 'book', bookId, updates)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function bulkHideBooks(bookIds: string[], reason: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('books').update({
      hidden_by_admin: true,
      admin_hide_reason: reason,
      hidden_at: new Date().toISOString(),
      status: 'unavailable',
    }).in('id', bookIds)

    await auditLog(admin.id, 'bulk_hide_books', 'book', null, { bookIds, reason })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════
// REQUEST MANAGEMENT
// ═══════════════════════════════════════════

export async function cancelRequest(requestId: string, reason: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'cancel_request', 'request', requestId, { reason })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function forceReturnBook(requestId: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'force_return', 'request', requestId)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════
// REPORTS & MODERATION
// ═══════════════════════════════════════════

export async function updateReportStatus(
  reportId: string,
  status: string
): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    const updates: Record<string, unknown> = { status }
    if (status === 'resolved' || status === 'dismissed') {
      updates.resolved_at = new Date().toISOString()
      updates.resolved_by = admin.id
    }

    await supabase.from('reports').update(updates).eq('id', reportId)
    await auditLog(admin.id, 'update_report', 'report', reportId, { status })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function assignReport(reportId: string, assigneeId: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('reports').update({ assigned_to: assigneeId }).eq('id', reportId)
    await auditLog(admin.id, 'assign_report', 'report', reportId, { assigneeId })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function addAdminNote(reportId: string, content: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('admin_notes').insert({
      report_id: reportId,
      admin_id: admin.id,
      content,
    })

    await auditLog(admin.id, 'add_note', 'report', reportId)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function updateReportCategory(reportId: string, category: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('reports').update({ category }).eq('id', reportId)
    await auditLog(admin.id, 'categorize_report', 'report', reportId, { category })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════
// CLUB MANAGEMENT
// ═══════════════════════════════════════════

export async function deactivateClub(clubId: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('clubs').update({ active: false }).eq('id', clubId)
    await auditLog(admin.id, 'deactivate_club', 'club', clubId)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function reactivateClub(clubId: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('clubs').update({ active: true }).eq('id', clubId)
    await auditLog(admin.id, 'reactivate_club', 'club', clubId)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function removeClubMember(clubId: string, userId: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('club_members')
      .delete()
      .eq('club_id', clubId)
      .eq('user_id', userId)

    await auditLog(admin.id, 'remove_club_member', 'club', clubId, { userId })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function transferClubOwnership(clubId: string, newOwnerId: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('super_admin')
    const supabase = await createClient()

    await supabase.from('clubs').update({ creator_id: newOwnerId }).eq('id', clubId)
    await auditLog(admin.id, 'transfer_club', 'club', clubId, { newOwnerId })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════
// CONTENT MANAGEMENT
// ═══════════════════════════════════════════

export async function createAnnouncement(data: {
  title: string
  body?: string
  type: string
  isBanner: boolean
  endsAt?: string
}): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'create_announcement', 'announcement', null, data)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('announcements').delete().eq('id', id)
    await auditLog(admin.id, 'delete_announcement', 'announcement', id)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function manageGenre(action: 'add' | 'toggle', name: string, active?: boolean): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    if (action === 'add') {
      await supabase.from('genres').insert({ name, active: true })
    } else {
      await supabase.from('genres').update({ active: active ?? false }).eq('name', name)
    }

    await auditLog(admin.id, `genre_${action}`, 'genre', null, { name, active })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function manageArea(action: 'add' | 'toggle', name: string, district?: string, active?: boolean): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    if (action === 'add') {
      await supabase.from('areas').insert({ name, district: district || null, active: true })
    } else {
      await supabase.from('areas').update({ active: active ?? false }).eq('name', name)
    }

    await auditLog(admin.id, `area_${action}`, 'area', null, { name, district, active })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function saveBotm(data: {
  title: string
  author?: string
  description?: string
  coverUrl?: string
  monthLabel?: string
}): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'set_botm', 'botm', null, data)
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════
// NOTIFICATIONS & COMMUNICATION
// ═══════════════════════════════════════════

export async function sendBroadcastNotification(
  title: string,
  body?: string,
  link?: string,
  filterArea?: string
): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

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

    await auditLog(admin.id, 'broadcast_notification', 'notification', null, {
      title, recipientCount: users?.length ?? 0, filterArea
    })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function sendDirectNotification(
  userId: string,
  title: string,
  body?: string
): Promise<ActionResult> {
  try {
    const admin = await guardRole('moderator')
    const supabase = await createClient()

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'admin',
      title,
      body: body || null,
      link: '/notifications',
    })

    await auditLog(admin.id, 'direct_notification', 'notification', userId, { title })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════
// PLATFORM SETTINGS
// ═══════════════════════════════════════════

export async function updatePlatformSetting(key: string, value: string): Promise<ActionResult> {
  try {
    const admin = await guardRole('super_admin')
    const supabase = await createClient()

    await supabase.from('platform_settings')
      .update({ value: JSON.stringify(value), updated_at: new Date().toISOString(), updated_by: admin.id })
      .eq('key', key)

    await auditLog(admin.id, 'update_setting', 'setting', null, { key, value })
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}
