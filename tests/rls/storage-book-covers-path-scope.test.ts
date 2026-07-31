import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, type TestUser } from './helpers'

// Regression test for a fixed bug (Guide ch.14): the book-covers upload
// policy used to check only bucket_id, with no path restriction and no
// UPDATE/DELETE policy at all -- any authenticated user could upload to (or,
// once one existed, overwrite) any object path, including another user's.
// The client already namespaced uploads as `{userId}/{timestamp}.{ext}`;
// fixed by requiring (storage.foldername(name))[1] = auth.uid()::text on
// INSERT, UPDATE, and DELETE.
describe('book-covers storage uploads are scoped to the uploader', () => {
  let userA: TestUser
  let userB: TestUser
  const fileBody = new Blob(['not a real image, just test bytes'], { type: 'text/plain' })

  beforeAll(async () => {
    userA = await createTestUser()
    userB = await createTestUser()
  })

  afterAll(async () => {
    // best-effort: remove anything that did get created under either prefix
    await userA.client.storage.from('book-covers').remove([`${userA.id}/cover.txt`])
    await deleteTestUsers([userA.id, userB.id])
  })

  it('allows a user to upload under their own id prefix', async () => {
    const { error } = await userA.client.storage.from('book-covers').upload(`${userA.id}/cover.txt`, fileBody)
    expect(error).toBeNull()
  })

  it('blocks a user from uploading under another user\'s id prefix', async () => {
    const { error } = await userB.client.storage.from('book-covers').upload(`${userA.id}/hijacked.txt`, fileBody)
    expect(error).not.toBeNull()
  })

  it('blocks a user from overwriting another user\'s existing cover', async () => {
    const { error } = await userB.client.storage.from('book-covers').update(`${userA.id}/cover.txt`, fileBody)
    expect(error).not.toBeNull()
  })

  it('blocks a user from deleting another user\'s cover', async () => {
    const { error } = await userB.client.storage.from('book-covers').remove([`${userA.id}/cover.txt`])
    // storage remove() reports success even for paths RLS hides rather than
    // erroring -- so assert on the effect (the object must still exist),
    // not on `error`.
    expect(error).toBeNull()

    const { data } = await userA.client.storage.from('book-covers').list(userA.id)
    expect(data?.some((f) => f.name === 'cover.txt')).toBe(true)
  })
})
