import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type AdminRole = 'super_admin' | 'moderator' | 'viewer'

export type AdminUser = {
  id: string
  email: string
  display_name: string | null
  admin_role: AdminRole
}

export async function requireAdmin(minRole: AdminRole = 'viewer'): Promise<AdminUser> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, is_admin, admin_role')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin || !profile.admin_role) redirect('/browse')

  const hierarchy: Record<AdminRole, number> = { viewer: 0, moderator: 1, super_admin: 2 }
  if (hierarchy[profile.admin_role as AdminRole] < hierarchy[minRole]) redirect('/admin')

  return {
    id: user.id,
    email: user.email ?? '',
    display_name: profile.display_name,
    admin_role: profile.admin_role as AdminRole,
  }
}

export async function checkAdminAPI(minRole: AdminRole = 'viewer') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, is_admin, admin_role')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin || !profile.admin_role) return null

  const hierarchy: Record<AdminRole, number> = { viewer: 0, moderator: 1, super_admin: 2 }
  if (hierarchy[profile.admin_role as AdminRole] < hierarchy[minRole]) return null

  return {
    id: user.id,
    email: user.email ?? '',
    display_name: profile.display_name,
    admin_role: profile.admin_role as AdminRole,
  }
}
