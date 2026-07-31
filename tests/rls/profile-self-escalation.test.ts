import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, promoteToRole, type TestUser } from './helpers'

// Regression test for a fixed, genuinely exploitable bug (Guide ch.14): the
// profiles UPDATE policies grant access based on *who* is updating a row,
// never *which columns* -- so nothing stopped a user PATCHing their own row
// to set is_admin/admin_role directly, or a moderator promoting themself to
// super_admin by calling PostgREST directly (bypassing the app-level
// guardRole('super_admin') check). RLS can't express "these columns,
// conditionally", so the fix is the guard_profile_privileged_columns()
// BEFORE UPDATE trigger. These tests exercise the trigger, not just RLS.
describe('profile privilege-escalation guard', () => {
  let regular: TestUser
  let moderator: TestUser
  let superAdmin: TestUser
  let target: TestUser

  beforeAll(async () => {
    regular = await createTestUser()
    moderator = await createTestUser()
    superAdmin = await createTestUser()
    target = await createTestUser()
    await promoteToRole(moderator.id, 'moderator')
    await promoteToRole(superAdmin.id, 'super_admin')
  })

  afterAll(async () => {
    await deleteTestUsers([regular.id, moderator.id, superAdmin.id, target.id])
  })

  it('blocks a regular user from granting themself admin', async () => {
    const { error } = await regular.client
      .from('profiles')
      .update({ is_admin: true, admin_role: 'super_admin' })
      .eq('id', regular.id)

    expect(error).not.toBeNull()
  })

  it('blocks a regular user from lifting their own ban fields', async () => {
    const { error } = await regular.client
      .from('profiles')
      .update({ is_banned: true, ban_reason: 'self-inflicted' })
      .eq('id', regular.id)

    expect(error).not.toBeNull()
  })

  it('allows a regular user to update their own non-privileged columns', async () => {
    const { error } = await regular.client
      .from('profiles')
      .update({ display_name: 'A New Name' })
      .eq('id', regular.id)

    expect(error).toBeNull()
  })

  it('blocks a moderator from self-promoting to super_admin', async () => {
    const { error } = await moderator.client
      .from('profiles')
      .update({ admin_role: 'super_admin' })
      .eq('id', moderator.id)

    expect(error).not.toBeNull()
  })

  it('blocks a moderator from setting another user\'s admin fields', async () => {
    const { error } = await moderator.client
      .from('profiles')
      .update({ is_admin: true, admin_role: 'super_admin' })
      .eq('id', target.id)

    expect(error).not.toBeNull()
  })

  it('allows a moderator to ban another user (ban fields are their lane)', async () => {
    const { error } = await moderator.client
      .from('profiles')
      .update({ is_banned: true, ban_reason: 'violated community guidelines' })
      .eq('id', target.id)

    expect(error).toBeNull()
  })

  it('allows a super_admin to grant another user a role', async () => {
    const { error } = await superAdmin.client
      .from('profiles')
      .update({ is_admin: true, admin_role: 'moderator' })
      .eq('id', target.id)

    expect(error).toBeNull()
  })
})
