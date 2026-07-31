import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, promoteToRole, serviceClient, type TestUser } from './helpers'

// Regression test for a fixed bug (Guide ch.14): a stale legacy policy
// ("Admins delete books") granted DELETE to any is_admin = true user,
// including a plain moderator -- silently bypassing the newer policy's
// intent that only super_admin can delete a book outright (moderators can
// only hide/edit one). The legacy policy has been dropped; this pins the
// correct behavior down so it can't quietly come back.
describe('only super_admin can delete another user\'s book', () => {
  let owner: TestUser
  let moderator: TestUser
  let superAdmin: TestUser
  let bookId: string

  beforeAll(async () => {
    owner = await createTestUser()
    moderator = await createTestUser()
    superAdmin = await createTestUser()
    await promoteToRole(moderator.id, 'moderator')
    await promoteToRole(superAdmin.id, 'super_admin')

    const { data, error } = await owner.client
      .from('books')
      .insert({ owner_id: owner.id, title: 'A Book Worth Keeping', listing_type: 'donate' })
      .select('id')
      .single()
    if (error || !data) throw new Error(`failed to seed book: ${error?.message}`)
    bookId = data.id
  })

  afterAll(async () => {
    await deleteTestUsers([owner.id, moderator.id, superAdmin.id])
  })

  it('blocks a moderator from deleting someone else\'s book', async () => {
    await moderator.client.from('books').delete().eq('id', bookId)

    const { data } = await serviceClient.from('books').select('id').eq('id', bookId).maybeSingle()
    expect(data).not.toBeNull()
  })

  it('allows a super_admin to delete any book', async () => {
    const { error } = await superAdmin.client.from('books').delete().eq('id', bookId)
    expect(error).toBeNull()

    const { data } = await serviceClient.from('books').select('id').eq('id', bookId).maybeSingle()
    expect(data).toBeNull()
  })
})
