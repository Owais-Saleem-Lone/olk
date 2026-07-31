import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, type TestUser } from './helpers'

// Regression test for a fixed bug (Guide ch.14): "Users can insert own
// ratings" used to check only auth.uid() = rater_id, with no verification
// that rated_user_id was the real counterparty on request_id, nor that the
// exchange had completed. Anyone who knew/guessed a request_id could rate an
// arbitrary user. Fixed: WITH CHECK now requires an EXISTS match confirming
// the request is handed_over/returned and rater/rated are exactly that
// request's requester and book owner, in either direction.
describe('ratings INSERT verifies the real counterparty', () => {
  let owner: TestUser
  let requester: TestUser
  let stranger: TestUser
  let bystander: TestUser
  let completedRequestId: string
  let pendingRequestId: string

  beforeAll(async () => {
    owner = await createTestUser()
    requester = await createTestUser()
    stranger = await createTestUser()
    bystander = await createTestUser()

    const { data: book1 } = await owner.client
      .from('books')
      .insert({ owner_id: owner.id, title: 'Completed Exchange Book', listing_type: 'lend', lending_duration_months: 1 })
      .select('id')
      .single()

    const { data: request1 } = await requester.client
      .from('book_requests')
      .insert({ book_id: book1!.id, requester_id: requester.id })
      .select('id')
      .single()
    completedRequestId = request1!.id

    await owner.client
      .from('book_requests')
      .update({ status: 'handed_over', handed_over_at: new Date().toISOString() })
      .eq('id', completedRequestId)

    const { data: book2 } = await owner.client
      .from('books')
      .insert({ owner_id: owner.id, title: 'Still Pending Book', listing_type: 'lend', lending_duration_months: 1 })
      .select('id')
      .single()

    const { data: request2 } = await requester.client
      .from('book_requests')
      .insert({ book_id: book2!.id, requester_id: requester.id })
      .select('id')
      .single()
    pendingRequestId = request2!.id
  })

  afterAll(async () => {
    await deleteTestUsers([owner.id, requester.id, stranger.id, bystander.id])
  })

  it('allows the real requester to rate the real book owner after handover', async () => {
    const { error } = await requester.client.from('ratings').insert({
      request_id: completedRequestId,
      rater_id: requester.id,
      rated_user_id: owner.id,
      score: 5,
    })
    expect(error).toBeNull()
  })

  it('allows the real book owner to rate the real requester after handover', async () => {
    const { error } = await owner.client.from('ratings').insert({
      request_id: completedRequestId,
      rater_id: owner.id,
      rated_user_id: requester.id,
      score: 4,
    })
    expect(error).toBeNull()
  })

  it('blocks an uninvolved user from rating against someone else\'s request', async () => {
    const { error } = await stranger.client.from('ratings').insert({
      request_id: completedRequestId,
      rater_id: stranger.id,
      rated_user_id: owner.id,
      score: 1,
    })
    expect(error).not.toBeNull()
  })

  it('blocks the real requester from rating an unrelated bystander on a real request', async () => {
    const { error } = await requester.client.from('ratings').insert({
      request_id: completedRequestId,
      rater_id: requester.id,
      rated_user_id: bystander.id,
      score: 1,
    })
    expect(error).not.toBeNull()
  })

  it('blocks rating a request that has not completed yet', async () => {
    const { error } = await requester.client.from('ratings').insert({
      request_id: pendingRequestId,
      rater_id: requester.id,
      rated_user_id: owner.id,
      score: 5,
    })
    expect(error).not.toBeNull()
  })
})
