import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, promoteToRole, type TestUser } from './helpers'

// Baseline isolation for user_bans: there is no regular-user SELECT policy
// at all -- not even to view a ban row about yourself (users learn they're
// banned via profiles.is_banned instead). Admin/mod-only read and insert,
// and admin_id can't be spoofed to impersonate a different admin.
describe('user_bans is admin/mod-only, not even readable by its own subject', () => {
  let regular: TestUser
  let moderator: TestUser
  let target: TestUser
  let banId: string

  beforeAll(async () => {
    regular = await createTestUser()
    moderator = await createTestUser()
    target = await createTestUser()
    await promoteToRole(moderator.id, 'moderator')
  })

  afterAll(async () => {
    await deleteTestUsers([regular.id, moderator.id, target.id])
  })

  it('blocks a regular user from inserting a ban, even against themself', async () => {
    const { error } = await regular.client
      .from('user_bans')
      .insert({ user_id: regular.id, admin_id: regular.id, reason: 'self-service ban attempt' })
    expect(error).not.toBeNull()
  })

  it('blocks a moderator from inserting a ban attributed to a different admin', async () => {
    const { error } = await moderator.client
      .from('user_bans')
      .insert({ user_id: target.id, admin_id: regular.id, reason: 'impersonation attempt' })
    expect(error).not.toBeNull()
  })

  it('allows a moderator to insert a ban attributed to themself', async () => {
    const { data, error } = await moderator.client
      .from('user_bans')
      .insert({ user_id: target.id, admin_id: moderator.id, reason: 'violated community guidelines' })
      .select('id')
      .single()
    expect(error).toBeNull()
    banId = data!.id
  })

  it('hides ban records from a regular user, even about themself', async () => {
    const { data } = await target.client.from('user_bans').select('id').eq('id', banId)
    expect(data).toEqual([])
  })

  it('lets a moderator view ban records', async () => {
    const { data } = await moderator.client.from('user_bans').select('id').eq('id', banId)
    expect(data?.length).toBe(1)
  })
})
