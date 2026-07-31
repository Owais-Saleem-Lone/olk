import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, serviceClient, type TestUser } from './helpers'

// Baseline isolation for book_requests: visible only to the requester and
// the book's owner (plus admins); only the owner can transition its status,
// never the requester; and requester_id can't be spoofed on insert.
describe('book_requests are scoped to requester and book owner', () => {
  let owner: TestUser
  let requester: TestUser
  let stranger: TestUser
  let requestId: string

  beforeAll(async () => {
    owner = await createTestUser()
    requester = await createTestUser()
    stranger = await createTestUser()

    const { data: book } = await owner.client
      .from('books')
      .insert({ owner_id: owner.id, title: 'Request Isolation Book', listing_type: 'lend', lending_duration_months: 1 })
      .select('id')
      .single()

    const { data: request } = await requester.client
      .from('book_requests')
      .insert({ book_id: book!.id, requester_id: requester.id })
      .select('id')
      .single()
    requestId = request!.id
  })

  afterAll(async () => {
    await deleteTestUsers([owner.id, requester.id, stranger.id])
  })

  it('blocks creating a request with a spoofed requester_id', async () => {
    const { data: book } = await owner.client
      .from('books')
      .select('id')
      .eq('owner_id', owner.id)
      .limit(1)
      .single()

    const { error } = await stranger.client
      .from('book_requests')
      .insert({ book_id: book!.id, requester_id: requester.id })
    expect(error).not.toBeNull()
  })

  it('lets the requester see their own request', async () => {
    const { data } = await requester.client.from('book_requests').select('id').eq('id', requestId)
    expect(data?.length).toBe(1)
  })

  it('lets the book owner see the request', async () => {
    const { data } = await owner.client.from('book_requests').select('id').eq('id', requestId)
    expect(data?.length).toBe(1)
  })

  it('hides the request from an uninvolved user', async () => {
    const { data } = await stranger.client.from('book_requests').select('id').eq('id', requestId)
    expect(data).toEqual([])
  })

  it('blocks the requester from updating their own request\'s status', async () => {
    await requester.client.from('book_requests').update({ status: 'accepted' }).eq('id', requestId)

    const { data } = await serviceClient.from('book_requests').select('status').eq('id', requestId).single()
    expect(data?.status).toBe('pending')
  })

  it('allows the book owner to update the request\'s status', async () => {
    const { error } = await owner.client.from('book_requests').update({ status: 'accepted' }).eq('id', requestId)
    expect(error).toBeNull()

    const { data } = await serviceClient.from('book_requests').select('status').eq('id', requestId).single()
    expect(data?.status).toBe('accepted')
  })
})
