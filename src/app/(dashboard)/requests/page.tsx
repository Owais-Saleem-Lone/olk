"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { toast } from '@/hooks/use-toast'
import { createNotification } from '@/lib/notifications'
import { useRouter } from 'next/navigation'
import RatingModal from '@/components/rating-modal'
import RequestCard from '@/components/request-card'
import { useFeatureFlags } from '@/lib/use-feature-flags'
import { dueDaysLeft } from '@/lib/date-utils'

// FIXED: Removed the [] from books and profiles.
// Since a request belongs to ONE book and ONE user, Supabase returns them as single objects, not arrays.
type BookRequest = {
  id: string
  status: string
  created_at: string
  handed_over_at: string | null
  requester_id: string
  book_id: string
  books: { title: string; owner_id: string; listing_type: string; lending_duration_months: number | null; cover_url: string | null }
  profiles: { display_name: string | null; area_name: string | null }
}

export default function RequestsPage() {
  const supabase = createClient()
  const router = useRouter()
  const featureFlags = useFeatureFlags()
  const [incomingRequests, setIncomingRequests] = useState<BookRequest[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<BookRequest[]>([])
  const [ownerProfiles, setOwnerProfiles] = useState<Record<string, { display_name: string | null; area_name: string | null }>>({})
  const [loading, setLoading] = useState(true)
  const [ratedRequests, setRatedRequests] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [progressInputs, setProgressInputs] = useState<Record<string, number>>({})
  const [progressSaving, setProgressSaving] = useState<string | null>(null)
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null)
  const [completingRequest, setCompletingRequest] = useState<string | null>(null)
  const [ratingTarget, setRatingTarget] = useState<{
    requestId: string; raterId: string; ratedUserId: string; ratedUserName: string; bookTitle: string
  } | null>(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    const { data: myRatings } = await supabase
      .from('ratings')
      .select('request_id')
      .eq('rater_id', user.id)
    if (myRatings) {
      setRatedRequests(new Set(myRatings.map(r => r.request_id)))
    }

    // 1. Fetch OUTGOING requests (requests I made to others)
    const { data: outgoingData, error: outError } = await supabase
      .from('book_requests')
      .select('id, status, created_at, handed_over_at, requester_id, book_id, books(title, owner_id, listing_type, lending_duration_months, cover_url), profiles(display_name, area_name)')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })

    if (outError) console.error('Outgoing error:', outError)
    if (outgoingData) {
      const outgoing = outgoingData as unknown as BookRequest[]
      setOutgoingRequests(outgoing)

      // profiles(display_name, area_name) above resolves via requester_id, i.e. ME —
      // useless for outgoing cards. books.owner_id has no FK to profiles (only to
      // auth.users), so PostgREST can't embed it; batch-fetch owner profiles instead.
      const ownerIds = [...new Set(outgoing.map(r => r.books?.owner_id).filter(Boolean))]
      if (ownerIds.length > 0) {
        const { data: ownerProfileData } = await supabase
          .from('profiles')
          .select('id, display_name, area_name')
          .in('id', ownerIds)
        if (ownerProfileData) {
          const map: Record<string, { display_name: string | null; area_name: string | null }> = {}
          ownerProfileData.forEach((p) => { map[p.id] = p })
          setOwnerProfiles(map)
        }
      }

      // Fetch existing reading progress for handed-over outgoing requests
      const handedOverIds = outgoing
        .filter(r => r.status === 'handed_over')
        .map(r => r.id)
      if (handedOverIds.length > 0) {
        const { data: progressData } = await supabase
          .from('book_progress')
          .select('request_id, progress_pct')
          .in('request_id', handedOverIds)
          .eq('reader_id', user.id)
        if (progressData) {
          const inputs: Record<string, number> = {}
          progressData.forEach((p: { request_id: string; progress_pct: number }) => { inputs[p.request_id] = p.progress_pct })
          setProgressInputs(prev => ({ ...prev, ...inputs }))
        }
      }
    }

    // 2. Find the IDs of all books I own
    const { data: myBooksData } = await supabase
      .from('books')
      .select('id')
      .eq('owner_id', user.id)
    
    const myBookIds = myBooksData?.map(b => b.id) || []

    // 3. Fetch INCOMING requests (requests for books I own)
    let incomingData = null
    if (myBookIds.length > 0) {
      const { data, error: incError } = await supabase
        .from('book_requests')
        .select('id, status, created_at, handed_over_at, requester_id, book_id, books(title, owner_id, listing_type, lending_duration_months, cover_url), profiles(display_name, area_name)')
        .in('book_id', myBookIds)
        .order('created_at', { ascending: false })

      if (incError) console.error('Incoming error:', incError)
      incomingData = data
    } 

    if (incomingData) {
      setIncomingRequests(incomingData as unknown as BookRequest[])
    } else {
      setIncomingRequests([])
    }

    setLoading(false)
  }, [supabase])

  useAsyncEffect(() => fetchRequests(), [fetchRequests])

  const handleUpdateStatus = async (requestId: string, newStatus: string) => {
    const { error } = await supabase
      .from('book_requests')
      .update({ status: newStatus })
      .eq('id', requestId)

    if (error) {
      toast.error('Error updating request: ' + error.message)
    } else {
      const req = incomingRequests.find(r => r.id === requestId)
      if (req) {
        await createNotification({
          userId: req.requester_id,
          type: newStatus === 'accepted' ? 'request_accepted' : 'request_declined',
          title: newStatus === 'accepted'
            ? `Your request for "${req.books?.title}" was accepted!`
            : `Your request for "${req.books?.title}" was declined`,
          link: '/requests',
          context: { kind: 'request', id: requestId },
        })
      }
      fetchRequests()
    }
  }

  const handleMessage = (requestId: string) => {
    router.push(`/messages/${requestId}`)
  }

  const handleHandover = async (req: BookRequest) => {
    const updates: Record<string, unknown> = { status: 'handed_over', handed_over_at: new Date().toISOString() }
    if (req.books?.listing_type === 'donate') {
      updates.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('book_requests')
      .update(updates)
      .eq('id', req.id)

    if (error) { toast.error('Error: ' + error.message); return }

    if (req.books?.listing_type === 'donate') {
      await supabase.from('books').update({ status: 'given' }).eq('id', req.book_id)
    } else {
      await supabase.from('books').update({ status: 'unavailable' }).eq('id', req.book_id)
    }

    const { data: { user } } = await supabase.auth.getUser()
    const otherId = user?.id === req.requester_id ? req.books?.owner_id : req.requester_id
    if (otherId) {
      await createNotification({
        userId: otherId,
        type: 'handover_confirmed',
        title: `Handover confirmed for "${req.books?.title}"`,
        link: '/requests',
        context: { kind: 'request', id: req.id },
      })
    }

    fetchRequests()
  }

  const handleReturn = async (req: BookRequest) => {
    const { error } = await supabase
      .from('book_requests')
      .update({ status: 'returned', completed_at: new Date().toISOString() })
      .eq('id', req.id)

    if (error) { toast.error('Error: ' + error.message); return }

    await supabase.from('books').update({ status: 'available' }).eq('id', req.book_id)

    const { data: { user } } = await supabase.auth.getUser()
    const otherId = user?.id === req.requester_id ? req.books?.owner_id : req.requester_id
    if (otherId) {
      await createNotification({
        userId: otherId,
        type: 'book_returned',
        title: `"${req.books?.title}" has been marked as returned`,
        link: '/requests',
        context: { kind: 'request', id: req.id },
      })
    }

    fetchRequests()
  }

  const handleCompleteReading = async (requestId: string) => {
    setCompletingRequest(requestId)
    const { error } = await supabase.rpc('complete_donated_book_reading', { p_request_id: requestId })
    if (error) toast.error('Error: ' + error.message)
    else { setConfirmComplete(null); fetchRequests() }
    setCompletingRequest(null)
  }

  const handleUpdateProgress = async (requestId: string, bookId: string) => {
    if (!currentUserId) return
    const pct = progressInputs[requestId] ?? 0
    setProgressSaving(requestId)
    const { error } = await supabase.from('book_progress').upsert({
      book_id: bookId,
      request_id: requestId,
      reader_id: currentUserId,
      progress_pct: pct,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'request_id' })
    if (error) toast.error('Error saving progress: ' + error.message)
    setProgressSaving(null)
  }

  if (loading) return <p className="text-slate-400">Loading requests...</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Book Requests</h1>
      <p className="text-slate-400 mb-8">Manage incoming and outgoing book requests</p>

      {/* Incoming Requests */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold mb-4">📩 Incoming Requests</h2>
        {incomingRequests.length === 0 ? (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-center text-slate-500">
            No one has requested your books yet.
          </div>
        ) : (
          <div className="space-y-4">
            {incomingRequests.map((req) => (
              <RequestCard
                key={req.id}
                coverUrl={req.books?.cover_url ?? null}
                title={req.books?.title || 'Unknown Book'}
                otherUserId={req.requester_id}
                otherUserLabel="Requested by"
                otherUserName={req.profiles?.display_name || 'Unknown User'}
                otherUserArea={req.profiles?.area_name ?? null}
                status={req.status}
                listingType={req.books?.listing_type || 'donate'}
                dueDaysLeft={
                  req.status === 'handed_over' && req.books?.listing_type === 'lend'
                    ? dueDaysLeft(req.handed_over_at, req.books?.lending_duration_months ?? null)
                    : null
                }
                actions={
                  <>
                    {req.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(req.id, 'accepted')}
                          className="bg-brand-teal/10 text-brand-teal-light border border-brand-teal/20 hover:bg-brand-teal/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(req.id, 'declined')}
                          className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {req.status === 'accepted' && (
                      <>
                        <button
                          onClick={() => handleHandover(req)}
                          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                          🤝 Confirm Handover
                        </button>
                        {featureFlags.feature_messages && (
                          <button
                            onClick={() => handleMessage(req.id)}
                            className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                          >
                            💬 Message
                          </button>
                        )}
                      </>
                    )}
                    {featureFlags.feature_ratings && req.status === 'handed_over' && req.books?.listing_type === 'donate' && currentUserId && !ratedRequests.has(req.id) && (
                      <button onClick={() => setRatingTarget({ requestId: req.id, raterId: currentUserId, ratedUserId: req.requester_id, ratedUserName: req.profiles?.display_name || 'User', bookTitle: req.books?.title || '' })}
                        className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
                    )}
                    {req.status === 'handed_over' && req.books?.listing_type === 'lend' && (
                      <>
                        <button
                          onClick={() => handleReturn(req)}
                          className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                          📗 Mark Returned
                        </button>
                        {featureFlags.feature_messages && (
                          <button
                            onClick={() => handleMessage(req.id)}
                            className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                          >
                            💬 Message
                          </button>
                        )}
                      </>
                    )}
                    {featureFlags.feature_ratings && req.status === 'returned' && currentUserId && !ratedRequests.has(req.id) && (
                      <button onClick={() => setRatingTarget({ requestId: req.id, raterId: currentUserId, ratedUserId: req.requester_id, ratedUserName: req.profiles?.display_name || 'User', bookTitle: req.books?.title || '' })}
                        className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
                    )}
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Outgoing Requests */}
      <div>
        <h2 className="text-xl font-semibold mb-4">📤 Outgoing Requests</h2>
        {outgoingRequests.length === 0 ? (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-center text-slate-500">
            You haven&apos;t requested any books yet.
          </div>
        ) : (
          <div className="space-y-4">
            {outgoingRequests.map((req) => {
              const owner = req.books?.owner_id ? ownerProfiles[req.books.owner_id] : undefined
              return (
                <RequestCard
                  key={req.id}
                  coverUrl={req.books?.cover_url ?? null}
                  title={req.books?.title || 'Unknown Book'}
                  otherUserId={req.books?.owner_id || ''}
                  otherUserLabel="Owned by"
                  otherUserName={owner?.display_name || 'Unknown User'}
                  otherUserArea={owner?.area_name ?? null}
                  status={req.status}
                  listingType={req.books?.listing_type || 'donate'}
                  dueDaysLeft={
                    req.status === 'handed_over' && req.books?.listing_type === 'lend'
                      ? dueDaysLeft(req.handed_over_at, req.books?.lending_duration_months ?? null)
                      : null
                  }
                  actions={
                    <>
                      {req.status === 'accepted' && (
                        <>
                          <button
                            onClick={() => handleHandover(req)}
                            className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                          >
                            🤝 Confirm Handover
                          </button>
                          {featureFlags.feature_messages && (
                            <button
                              onClick={() => handleMessage(req.id)}
                              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                            >
                              💬 Message
                            </button>
                          )}
                        </>
                      )}
                      {featureFlags.feature_ratings && req.status === 'handed_over' && req.books?.listing_type === 'donate' && currentUserId && !ratedRequests.has(req.id) && (
                        <button onClick={() => setRatingTarget({ requestId: req.id, raterId: currentUserId, ratedUserId: req.books?.owner_id, ratedUserName: 'the owner', bookTitle: req.books?.title || '' })}
                          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
                      )}
                      {req.status === 'handed_over' && req.books?.listing_type === 'lend' && (
                        <>
                          <button
                            onClick={() => handleReturn(req)}
                            className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                          >
                            📗 Mark Returned
                          </button>
                          {featureFlags.feature_messages && (
                            <button
                              onClick={() => handleMessage(req.id)}
                              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                            >
                              💬 Message
                            </button>
                          )}
                        </>
                      )}
                      {featureFlags.feature_ratings && req.status === 'returned' && currentUserId && !ratedRequests.has(req.id) && (
                        <button onClick={() => setRatingTarget({ requestId: req.id, raterId: currentUserId, ratedUserId: req.books?.owner_id, ratedUserName: 'the owner', bookTitle: req.books?.title || '' })}
                          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
                      )}
                    </>
                  }
                  footer={req.status === 'handed_over' && (
                    <div className="border-t border-white/[0.05] pt-3 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-slate-400">📖 Reading progress</span>
                          <span className="text-xs text-brand-teal-light font-semibold tabular-nums">
                            {progressInputs[req.id] ?? 0}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={progressInputs[req.id] ?? 0}
                            onChange={e =>
                              setProgressInputs(prev => ({ ...prev, [req.id]: parseInt(e.target.value) }))
                            }
                            className="flex-1 accent-brand-teal cursor-pointer"
                          />
                          <button
                            onClick={() => handleUpdateProgress(req.id, req.book_id)}
                            disabled={progressSaving === req.id}
                            className="text-xs bg-brand-teal/10 text-brand-teal-light border border-brand-teal/20 hover:bg-brand-teal/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                          >
                            {progressSaving === req.id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          Visible to the community in Browse Books
                        </p>
                      </div>

                      {/* Completion actions — appear only at 100% */}
                      {progressInputs[req.id] === 100 && req.books?.listing_type === 'donate' && (
                        <div className="bg-brand-teal/[0.05] border border-brand-teal/20 rounded-xl px-4 py-3">
                          {confirmComplete === req.id ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-xs text-slate-300 flex-1">
                                The book will move to <span className="text-white font-medium">your My Books</span> as available — ready to pass on to the next reader.
                              </p>
                              <button
                                onClick={() => handleCompleteReading(req.id)}
                                disabled={completingRequest === req.id}
                                className="text-xs bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                              >
                                {completingRequest === req.id ? 'Processing...' : 'Yes, pass it on'}
                              </button>
                              <button
                                onClick={() => setConfirmComplete(null)}
                                className="text-xs text-slate-500 hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs text-teal-300">
                                🎉 You&apos;ve finished the book! Ready to pass it on to the next reader?
                              </p>
                              <button
                                onClick={() => setConfirmComplete(req.id)}
                                className="text-xs bg-brand-teal/20 hover:bg-brand-teal/30 text-teal-300 border border-brand-teal/30 font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                              >
                                Complete Reading
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {progressInputs[req.id] === 100 && req.books?.listing_type === 'lend' && (
                        <p className="text-xs text-blue-400 bg-blue-500/[0.05] border border-blue-500/20 rounded-xl px-4 py-3">
                          📚 Reading complete! Please return the book to its owner when ready.
                        </p>
                      )}
                    </div>
                  )}
                />
              )
            })}
          </div>
        )}
      </div>

      {ratingTarget && (
        <RatingModal
          {...ratingTarget}
          onClose={() => setRatingTarget(null)}
          onSubmitted={() => {
            setRatedRequests(prev => new Set(prev).add(ratingTarget.requestId))
            setRatingTarget(null)
          }}
        />
      )}
    </div>
  )
}