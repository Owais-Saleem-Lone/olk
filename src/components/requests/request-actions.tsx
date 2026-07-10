import type { FeatureFlags } from '@/lib/platform-settings'
import type { BookRequest } from './types'

// Same "Confirm Handover / Message / Return / Rate" progression applies to both
// incoming and outgoing requests; only the pending-request Accept/Decline pair
// (incoming-only, since the book owner is the one responding) and the rating
// target's counterparty differ.
export default function RequestActions({
  kind,
  req,
  featureFlags,
  currentUserId,
  isRated,
  onAccept,
  onDecline,
  onHandover,
  onMessage,
  onReturn,
  onRate,
}: {
  kind: 'incoming' | 'outgoing'
  req: BookRequest
  featureFlags: FeatureFlags
  currentUserId: string | null
  isRated: boolean
  onAccept?: () => void
  onDecline?: () => void
  onHandover: () => void
  onMessage: () => void
  onReturn: () => void
  onRate: () => void
}) {
  const canRate = featureFlags.feature_ratings && currentUserId && !isRated

  return (
    <>
      {kind === 'incoming' && req.status === 'pending' && (
        <>
          <button
            onClick={onAccept}
            className="bg-brand-teal/10 text-brand-teal-light border border-brand-teal/20 hover:bg-brand-teal/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Accept
          </button>
          <button
            onClick={onDecline}
            className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Decline
          </button>
        </>
      )}
      {req.status === 'accepted' && (
        <>
          <button
            onClick={onHandover}
            className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            🤝 Confirm Handover
          </button>
          {featureFlags.feature_messages && (
            <button
              onClick={onMessage}
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              💬 Message
            </button>
          )}
        </>
      )}
      {canRate && req.status === 'handed_over' && req.books?.listing_type === 'donate' && (
        <button onClick={onRate}
          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
      )}
      {req.status === 'handed_over' && req.books?.listing_type === 'lend' && (
        <>
          <button
            onClick={onReturn}
            className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            📗 Mark Returned
          </button>
          {featureFlags.feature_messages && (
            <button
              onClick={onMessage}
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              💬 Message
            </button>
          )}
        </>
      )}
      {canRate && req.status === 'returned' && (
        <button onClick={onRate}
          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
      )}
    </>
  )
}
