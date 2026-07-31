import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, type TestUser } from './helpers'

// Regression test for a fixed bug (Guide ch.14): the notifications INSERT
// policy used to allow any authenticated user to insert a row addressed to
// an arbitrary other user's user_id. Fixed to require auth.uid() = user_id;
// legitimate cross-user notifications (e.g. "your request was accepted")
// now go through createNotification()'s service-role client instead.
describe('notifications INSERT is scoped to the caller', () => {
  let userA: TestUser
  let userB: TestUser

  beforeAll(async () => {
    userA = await createTestUser()
    userB = await createTestUser()
  })

  afterAll(async () => {
    await deleteTestUsers([userA.id, userB.id])
  })

  it('blocks inserting a notification addressed to another user', async () => {
    const { error } = await userA.client
      .from('notifications')
      .insert({ user_id: userB.id, type: 'admin', title: 'You have been selected' })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('allows inserting a notification addressed to yourself', async () => {
    const { error } = await userA.client
      .from('notifications')
      .insert({ user_id: userA.id, type: 'admin', title: 'Reminder' })

    expect(error).toBeNull()
  })
})
