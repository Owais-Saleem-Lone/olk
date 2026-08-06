import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, promoteToRole, serviceClient, type TestUser } from './helpers'

// Coverage for the request-then-approve membership workflow: joining a club
// no longer makes you a member immediately -- it files a 'pending'
// club_members row that only the club owner can move to 'approved'. Also
// covers the club_requests identity-verification gate: approve_club_request
// must now refuse to create the club until an admin has explicitly marked
// identity as verified.
describe('club membership approval workflow', () => {
  let owner: TestUser
  let applicant: TestUser
  let outsider: TestUser
  let clubId: string

  beforeAll(async () => {
    owner = await createTestUser()
    applicant = await createTestUser()
    outsider = await createTestUser()

    for (let i = 0; i < 5; i++) {
      const { data: book } = await serviceClient
        .from('books')
        .insert({ owner_id: owner.id, title: `Eligibility Book ${i}`, listing_type: 'lend', lending_duration_months: 1 })
        .select('id')
        .single()
      await serviceClient.from('book_requests').insert({ book_id: book!.id, requester_id: applicant.id, status: 'returned' })
    }

    const { data: club, error } = await serviceClient
      .from('clubs')
      .insert({ name: 'Approval Workflow Club', creator_id: owner.id })
      .select('id')
      .single()
    if (error || !club) throw new Error(`failed to seed club fixture: ${error?.message}`)
    clubId = club.id

    const { error: ownerMemberError } = await serviceClient
      .from('club_members')
      .insert({ club_id: clubId, user_id: owner.id, status: 'approved' })
    if (ownerMemberError) throw new Error(`failed to seed owner membership: ${ownerMemberError.message}`)
  })

  afterAll(async () => {
    await deleteTestUsers([owner.id, applicant.id, outsider.id])
  })

  it('requesting to join creates a pending row, not an approved membership', async () => {
    const { error } = await applicant.client.from('club_members').insert({ club_id: clubId, user_id: applicant.id })
    expect(error).toBeNull()

    const { data } = await applicant.client.from('club_members').select('status').eq('club_id', clubId).eq('user_id', applicant.id).single()
    expect(data?.status).toBe('pending')
  })

  it('rejects a self-approval attempt at INSERT time', async () => {
    const { error } = await outsider.client.from('club_members').insert({ club_id: clubId, user_id: outsider.id, status: 'approved' })
    expect(error).not.toBeNull()
  })

  it('does not count a pending applicant toward member_count', async () => {
    const { data } = await outsider.client.from('clubs').select('member_count').eq('id', clubId).single()
    expect(data?.member_count).toBe(1) // just the owner
  })

  it('a pending applicant is not treated as a member yet (cannot post in chat)', async () => {
    const { error } = await applicant.client.from('club_posts').insert({ club_id: clubId, author_id: applicant.id, content: 'not yet a member' })
    expect(error).not.toBeNull()
  })

  it('blocks another member/outsider from approving the request', async () => {
    const { error } = await outsider.client
      .from('club_members')
      .update({ status: 'approved' })
      .eq('club_id', clubId)
      .eq('user_id', applicant.id)
    // RLS silently filters (0 rows affected) rather than erroring -- assert no error and no effect.
    expect(error).toBeNull()
    const { data } = await serviceClient.from('club_members').select('status').eq('club_id', clubId).eq('user_id', applicant.id).single()
    expect(data?.status).toBe('pending')
  })

  it('lets the club owner approve the request', async () => {
    const { error } = await owner.client
      .from('club_members')
      .update({ status: 'approved' })
      .eq('club_id', clubId)
      .eq('user_id', applicant.id)
    expect(error).toBeNull()

    const { data } = await owner.client.from('club_members').select('status').eq('club_id', clubId).eq('user_id', applicant.id).single()
    expect(data?.status).toBe('approved')
  })

  it('member_count increments once approved, and the new member can now post', async () => {
    const { data: club } = await outsider.client.from('clubs').select('member_count').eq('id', clubId).single()
    expect(club?.member_count).toBe(2)

    const { error } = await applicant.client.from('club_posts').insert({ club_id: clubId, author_id: applicant.id, content: 'now a member!' })
    expect(error).toBeNull()
  })
})

describe('club creation identity verification gate', () => {
  let requester: TestUser
  let filler: TestUser
  let moderator: TestUser
  let requestId: string

  beforeAll(async () => {
    requester = await createTestUser()
    filler = await createTestUser()
    moderator = await createTestUser()
    await promoteToRole(moderator.id, 'moderator')

    for (let i = 0; i < 5; i++) {
      const { data: book } = await serviceClient
        .from('books')
        .insert({ owner_id: requester.id, title: `Eligibility Book ${i}`, listing_type: 'lend', lending_duration_months: 1 })
        .select('id')
        .single()
      await serviceClient.from('book_requests').insert({ book_id: book!.id, requester_id: filler.id, status: 'returned' })
    }

    const { data: request, error } = await requester.client
      .from('club_requests')
      .insert({ requester_id: requester.id, name: 'Identity Gate Club', interests: ['Fiction'], description: 'test' })
      .select('id')
      .single()
    if (error || !request) throw new Error(`failed to seed club_requests fixture: ${error?.message}`)
    requestId = request.id
  })

  afterAll(async () => {
    await deleteTestUsers([requester.id, filler.id, moderator.id])
  })

  it('refuses to approve before identity is verified', async () => {
    const { error } = await moderator.client.rpc('approve_club_request', { p_request_id: requestId, p_note: null })
    expect(error?.message).toContain('Identity must be verified')
  })

  it('blocks a non-admin from marking identity verified', async () => {
    const { error } = await requester.client.rpc('mark_club_request_identity_verified', { p_request_id: requestId })
    expect(error).not.toBeNull()
  })

  it('lets a moderator mark identity verified, then approval succeeds', async () => {
    const { error: verifyError } = await moderator.client.rpc('mark_club_request_identity_verified', { p_request_id: requestId })
    expect(verifyError).toBeNull()

    const { data: newClubId, error: approveError } = await moderator.client.rpc('approve_club_request', { p_request_id: requestId, p_note: 'looks good' })
    expect(approveError).toBeNull()
    expect(newClubId).toBeTruthy()

    // The creator becomes an approved member directly, not a pending one.
    const { data: membership } = await serviceClient
      .from('club_members')
      .select('status')
      .eq('club_id', newClubId as string)
      .eq('user_id', requester.id)
      .single()
    expect(membership?.status).toBe('approved')
  })
})
