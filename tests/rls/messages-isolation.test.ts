import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, type TestUser } from './helpers'

// Baseline isolation for messages: only the request's requester and the
// book's owner may read or send messages for that request, and only ever as
// themself. There is no UPDATE/DELETE policy at all -- messages are
// immutable once sent (Guide ch.14).
describe('messages are scoped to the request\'s two participants', () => {
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
      .insert({ owner_id: owner.id, title: 'Message Test Book', listing_type: 'lend', lending_duration_months: 1 })
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

  it('allows the requester to send a message', async () => {
    const { error } = await requester.client
      .from('messages')
      .insert({ request_id: requestId, sender_id: requester.id, content: 'Hi, when can I pick this up?' })
    expect(error).toBeNull()
  })

  it('allows the book owner to send a message', async () => {
    const { error } = await owner.client
      .from('messages')
      .insert({ request_id: requestId, sender_id: owner.id, content: 'How about Tuesday?' })
    expect(error).toBeNull()
  })

  it('blocks an uninvolved user from sending a message for this request', async () => {
    const { error } = await stranger.client
      .from('messages')
      .insert({ request_id: requestId, sender_id: stranger.id, content: 'Butting in' })
    expect(error).not.toBeNull()
  })

  it('blocks impersonating another participant as the sender', async () => {
    const { error } = await requester.client
      .from('messages')
      .insert({ request_id: requestId, sender_id: owner.id, content: 'Pretending to be the owner' })
    expect(error).not.toBeNull()
  })

  it('lets a participant read the conversation', async () => {
    const { data, error } = await requester.client.from('messages').select('content').eq('request_id', requestId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('hides the conversation entirely from an uninvolved user', async () => {
    const { data, error } = await stranger.client.from('messages').select('content').eq('request_id', requestId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
