import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUsers, serviceClient, type TestUser } from './helpers'

// Regression test for a fixed bug (Guide ch.14): the event_rsvps INSERT
// policy checked visibility but not capacity at all -- "Event full" was only
// enforced by the RSVP button being disabled client-side. Confirmed
// exploitable via a raw POST that returned 201 against a capacity-1 event
// that already had its one attendee. Fixed: WITH CHECK now also requires
// capacity IS NULL OR attendee_count < capacity.
describe('event_rsvps INSERT respects capacity', () => {
  let creator: TestUser
  let attendee: TestUser
  let latecomer: TestUser
  let filler: TestUser
  let eventId: string

  beforeAll(async () => {
    creator = await createTestUser()
    attendee = await createTestUser()
    latecomer = await createTestUser()
    filler = await createTestUser()

    // clubs still carries its original BEFORE INSERT eligibility trigger
    // (check_club_creation_eligibility: 5+ completed exchanges, no reports)
    // even though regular users can no longer reach it -- the trigger itself
    // has no service-role/auth.uid()-IS-NULL bypass (unlike
    // guard_profile_privileged_columns), so it fires for this seed insert
    // too. Build the history for real rather than fighting it further.
    for (let i = 0; i < 5; i++) {
      const { data: book } = await serviceClient
        .from('books')
        .insert({ owner_id: creator.id, title: `Eligibility Book ${i}`, listing_type: 'lend', lending_duration_months: 1 })
        .select('id')
        .single()
      await serviceClient
        .from('book_requests')
        .insert({ book_id: book!.id, requester_id: filler.id, status: 'returned' })
    }

    // Regular users can no longer INSERT into `clubs` directly at all --
    // creation is submit-then-review via club_requests, materialized only by
    // the SECURITY DEFINER approve_club_request() RPC. A club is just a
    // fixture for this test (event_rsvps capacity is what's under test), so
    // seed it directly with the service client rather than exercising that
    // whole review workflow here.
    const { data: club, error: clubError } = await serviceClient
      .from('clubs')
      .insert({ name: 'Capacity Test Club', creator_id: creator.id })
      .select('id')
      .single()
    if (clubError || !club) throw new Error(`failed to seed club fixture: ${clubError?.message}`)

    const { data: event, error } = await creator.client
      .from('club_events')
      .insert({
        club_id: club!.id,
        creator_id: creator.id,
        title: 'One-Seat Event',
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        visibility: 'public',
        capacity: 1,
      })
      .select('id')
      .single()
    if (error || !event) throw new Error(`failed to seed event: ${error?.message}`)
    eventId = event.id
  })

  afterAll(async () => {
    await deleteTestUsers([creator.id, attendee.id, latecomer.id, filler.id])
  })

  it('allows the first RSVP into a capacity-1 event', async () => {
    const { error } = await attendee.client.from('event_rsvps').insert({ event_id: eventId, user_id: attendee.id })
    expect(error).toBeNull()
  })

  it('blocks a second RSVP once the event is at capacity', async () => {
    const { error } = await latecomer.client.from('event_rsvps').insert({ event_id: eventId, user_id: latecomer.id })
    expect(error).not.toBeNull()
  })
})
