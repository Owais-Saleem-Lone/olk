"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import RatingModal from '@/components/rating-modal'
import RequestCard from '@/components/request-card'
import RequestActions from '@/components/requests/request-actions'
import ReadingProgressFooter from '@/components/requests/reading-progress-footer'
import { useFeatureFlags } from '@/lib/use-feature-flags'
import { useRequests } from '@/hooks/use-requests'
import { dueDaysLeft } from '@/lib/date-utils'

export default function RequestsPage() {
  const router = useRouter()
  const featureFlags = useFeatureFlags()
  const {
    incomingRequests,
    outgoingRequests,
    ownerProfiles,
    loading,
    ratedRequests,
    setRatedRequests,
    currentUserId,
    progressInputs,
    setProgressInputs,
    progressSaving,
    confirmComplete,
    setConfirmComplete,
    completingRequest,
    handleUpdateStatus,
    handleHandover,
    handleReturn,
    handleCompleteReading,
    handleUpdateProgress,
  } = useRequests()

  const [ratingTarget, setRatingTarget] = useState<{
    requestId: string; raterId: string; ratedUserId: string; ratedUserName: string; bookTitle: string
  } | null>(null)

  const handleMessage = (requestId: string) => {
    router.push(`/messages/${requestId}`)
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
                  <RequestActions
                    kind="incoming"
                    req={req}
                    featureFlags={featureFlags}
                    currentUserId={currentUserId}
                    isRated={ratedRequests.has(req.id)}
                    onAccept={() => handleUpdateStatus(req.id, 'accepted')}
                    onDecline={() => handleUpdateStatus(req.id, 'declined')}
                    onHandover={() => handleHandover(req)}
                    onMessage={() => handleMessage(req.id)}
                    onReturn={() => handleReturn(req)}
                    onRate={() => setRatingTarget({
                      requestId: req.id,
                      raterId: currentUserId!,
                      ratedUserId: req.requester_id,
                      ratedUserName: req.profiles?.display_name || 'User',
                      bookTitle: req.books?.title || '',
                    })}
                  />
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
                    <RequestActions
                      kind="outgoing"
                      req={req}
                      featureFlags={featureFlags}
                      currentUserId={currentUserId}
                      isRated={ratedRequests.has(req.id)}
                      onHandover={() => handleHandover(req)}
                      onMessage={() => handleMessage(req.id)}
                      onReturn={() => handleReturn(req)}
                      onRate={() => setRatingTarget({
                        requestId: req.id,
                        raterId: currentUserId!,
                        ratedUserId: req.books?.owner_id,
                        ratedUserName: 'the owner',
                        bookTitle: req.books?.title || '',
                      })}
                    />
                  }
                  footer={
                    <ReadingProgressFooter
                      req={req}
                      progress={progressInputs[req.id] ?? 0}
                      onProgressChange={(pct) => setProgressInputs(prev => ({ ...prev, [req.id]: pct }))}
                      onSaveProgress={() => handleUpdateProgress(req.id, req.book_id)}
                      saving={progressSaving === req.id}
                      isConfirmingComplete={confirmComplete === req.id}
                      onConfirmComplete={() => setConfirmComplete(req.id)}
                      onCancelComplete={() => setConfirmComplete(null)}
                      onComplete={() => handleCompleteReading(req.id)}
                      completing={completingRequest === req.id}
                    />
                  }
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
