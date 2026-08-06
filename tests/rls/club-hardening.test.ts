import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, serviceClient, type TestUser } from './helpers'

// Coverage for the club/event hardening pass: member/participant-only
// visibility on rosters, member-writable club chat with role-aware rate
// limits, members-only club ratings, and the free-plan event limits (1/month
// per club, 10 participant cap). Seeds clubs directly via the service client
// (same shortcut event-rsvp-capacity.test.ts uses) rather than exercising the
// full club_requests review workflow, since that's not what's under test.
describe('club visibility, chat, ratings and event limits', () => {
  let owner: TestUser
  let member: TestUser
  let outsider: TestUser
  let clubId: string

  beforeAll(async () => {
    owner = await createTestUser()
    member = await createTestUser()
    outsider = await createTestUser()

    // clubs still carries its original BEFORE INSERT eligibility trigger
    // (check_club_creation_eligibility: 5+ completed exchanges, no reports)
    // with no service-role bypass, so it fires for this seed insert too --
    // see event-rsvp-capacity.test.ts for the same shortcut.
    for (let i = 0; i < 5; i++) {
      const { data: book } = await serviceClient
        .from('books')
        .insert({ owner_id: owner.id, title: `Eligibility Book ${i}`, listing_type: 'lend', lending_duration_months: 1 })
        .select('id')
        .single()
      await serviceClient
        .from('book_requests')
        .insert({ book_id: book!.id, requester_id: outsider.id, status: 'returned' })
    }

    const { data: club, error } = await serviceClient
      .from('clubs')
      .insert({ name: 'Hardening Test Club', creator_id: owner.id })
      .select('id')
      .single()
    if (error || !club) throw new Error(`failed to seed club fixture: ${error?.message}`)
    clubId = club.id

    const { error: memberError } = await serviceClient
      .from('club_members')
      .insert([
        { club_id: clubId, user_id: owner.id, status: 'approved' },
        { club_id: clubId, user_id: member.id, status: 'approved' },
      ])
    if (memberError) throw new Error(`failed to seed club_members: ${memberError.message}`)
  })

  afterAll(async () => {
    await deleteTestUsers([owner.id, member.id, outsider.id])
  })

  describe('club_members roster visibility', () => {
    it('is empty for a non-member (RLS filters rather than errors)', async () => {
      const { data, error } = await outsider.client.from('club_members').select('user_id').eq('club_id', clubId)
      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('shows the full roster to a fellow member', async () => {
      const { data, error } = await member.client.from('club_members').select('user_id').eq('club_id', clubId)
      expect(error).toBeNull()
      expect(data?.map(r => r.user_id).sort()).toEqual([member.id, owner.id].sort())
    })
  })

  describe('club chat (club_posts)', () => {
    it('lets a regular member post, not just the owner', async () => {
      const { error } = await member.client.from('club_posts').insert({
        club_id: clubId, author_id: member.id, content: 'hello from a member',
      })
      expect(error).toBeNull()
    })

    it('blocks a non-member from posting', async () => {
      const { error } = await outsider.client.from('club_posts').insert({
        club_id: clubId, author_id: outsider.id, content: 'i should not be able to post this',
      })
      expect(error).not.toBeNull()
    })

    it('enforces the member rate limit (10/hour) independently of the owner', async () => {
      // `member` already sent one message above; nine more reaches the cap.
      for (let i = 0; i < 9; i++) {
        const { error } = await member.client.from('club_posts').insert({
          club_id: clubId, author_id: member.id, content: `message ${i}`,
        })
        expect(error).toBeNull()
      }

      const { error: overLimit } = await member.client.from('club_posts').insert({
        club_id: clubId, author_id: member.id, content: 'this is message 11',
      })
      expect(overLimit?.message).toContain('RATE_LIMIT_EXCEEDED')

      // The owner has a separate (30/hour) budget -- hitting the member cap
      // must not throttle the owner's own posting.
      const { error: ownerError } = await owner.client.from('club_posts').insert({
        club_id: clubId, author_id: owner.id, content: 'owner is unaffected',
      })
      expect(ownerError).toBeNull()
    })
  })

  describe('club_ratings', () => {
    it('lets a member rate the club', async () => {
      const { error } = await member.client.from('club_ratings').insert({
        club_id: clubId, rater_id: member.id, score: 5,
      })
      expect(error).toBeNull()
    })

    it('blocks a non-member from rating the club', async () => {
      const { error } = await outsider.client.from('club_ratings').insert({
        club_id: clubId, rater_id: outsider.id, score: 1,
      })
      expect(error).not.toBeNull()
    })

    it('rolls the rating up onto clubs.rating_avg/rating_count', async () => {
      const { data, error } = await outsider.client.from('clubs').select('rating_avg, rating_count').eq('id', clubId).single()
      expect(error).toBeNull()
      expect(data?.rating_count).toBe(1)
      expect(Number(data?.rating_avg)).toBe(5)
    })
  })

  describe('event creation limits', () => {
    it('allows the first event for a club this month', async () => {
      const { error } = await owner.client.from('club_events').insert({
        club_id: clubId, creator_id: owner.id, title: 'First Event',
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      expect(error).toBeNull()
    })

    it('blocks a second event for the same club within 30 days', async () => {
      const { error } = await owner.client.from('club_events').insert({
        club_id: clubId, creator_id: owner.id, title: 'Second Event',
        starts_at: new Date(Date.now() + 172_800_000).toISOString(),
      })
      expect(error?.message).toContain('RATE_LIMIT_EXCEEDED')
    })

    it('defaults a null capacity to the plan cap of 10', async () => {
      const { data } = await serviceClient.from('club_events').select('capacity').eq('club_id', clubId).eq('title', 'First Event').single()
      expect(data?.capacity).toBe(10)
    })
  })
})
