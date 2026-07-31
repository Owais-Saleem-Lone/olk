import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, type TestUser } from './helpers'

// Baseline isolation for bookmarks and wishlists: fully self-service, no
// admin override at all (Guide ch.14) -- user_id = auth.uid(), no exceptions.
describe('bookmarks are fully private, no admin override', () => {
  let userA: TestUser
  let userB: TestUser
  let bookId: string
  let bookmarkId: string

  beforeAll(async () => {
    userA = await createTestUser()
    userB = await createTestUser()

    const { data: book } = await userA.client
      .from('books')
      .insert({ owner_id: userA.id, title: 'Bookmarkable Book', listing_type: 'donate' })
      .select('id')
      .single()
    bookId = book!.id
  })

  afterAll(async () => {
    await deleteTestUsers([userA.id, userB.id])
  })

  it('allows a user to bookmark a book for themself', async () => {
    const { data, error } = await userB.client
      .from('bookmarks')
      .insert({ user_id: userB.id, book_id: bookId })
      .select('id')
      .single()
    expect(error).toBeNull()
    bookmarkId = data!.id
  })

  it('blocks creating a bookmark on someone else\'s behalf', async () => {
    const { error } = await userA.client.from('bookmarks').insert({ user_id: userB.id, book_id: bookId })
    expect(error).not.toBeNull()
  })

  it('hides a user\'s bookmarks from everyone else', async () => {
    const { data } = await userA.client.from('bookmarks').select('id').eq('id', bookmarkId)
    expect(data).toEqual([])
  })

  it('blocks deleting another user\'s bookmark', async () => {
    await userA.client.from('bookmarks').delete().eq('id', bookmarkId)
    const { data } = await userB.client.from('bookmarks').select('id').eq('id', bookmarkId)
    expect(data?.length).toBe(1)
  })

  it('allows the owner to delete their own bookmark', async () => {
    const { error } = await userB.client.from('bookmarks').delete().eq('id', bookmarkId)
    expect(error).toBeNull()
    const { data } = await userB.client.from('bookmarks').select('id').eq('id', bookmarkId)
    expect(data).toEqual([])
  })
})

describe('wishlists are fully private, no admin override', () => {
  let userA: TestUser
  let userB: TestUser
  let wishlistId: string

  beforeAll(async () => {
    userA = await createTestUser()
    userB = await createTestUser()

    const { data } = await userA.client
      .from('wishlists')
      .insert({ user_id: userA.id, title: 'A Book I Cannot Find' })
      .select('id')
      .single()
    wishlistId = data!.id
  })

  afterAll(async () => {
    await deleteTestUsers([userA.id, userB.id])
  })

  it('hides a user\'s wishlist entries from everyone else', async () => {
    const { data } = await userB.client.from('wishlists').select('id').eq('id', wishlistId)
    expect(data).toEqual([])
  })

  it('blocks another user from updating your wishlist entry', async () => {
    await userB.client.from('wishlists').update({ title: 'Hijacked' }).eq('id', wishlistId)
    const { data } = await userA.client.from('wishlists').select('title').eq('id', wishlistId).single()
    expect(data?.title).toBe('A Book I Cannot Find')
  })

  it('allows the owner to update their own wishlist entry', async () => {
    const { error } = await userA.client.from('wishlists').update({ title: 'Updated Title' }).eq('id', wishlistId)
    expect(error).toBeNull()
  })
})
