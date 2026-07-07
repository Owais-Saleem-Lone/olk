import Link from 'next/link'
import RequestStepper from '@/components/request-stepper'

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  accepted: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  handed_over: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  returned: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  declined: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  handed_over: 'Handed Over',
  returned: 'Returned',
  declined: 'Declined',
}

function DueBadge({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return null
  if (daysLeft < 0)
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
        ⚠️ Overdue {Math.abs(daysLeft)}d
      </span>
    )
  if (daysLeft === 0)
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
        📅 Due today
      </span>
    )
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 whitespace-nowrap">
      📅 {daysLeft}d left
    </span>
  )
}

export default function RequestCard({
  coverUrl,
  title,
  otherUserId,
  otherUserLabel,
  otherUserName,
  otherUserArea,
  status,
  listingType,
  dueDaysLeft,
  actions,
  footer,
}: {
  coverUrl: string | null
  title: string
  otherUserId: string
  otherUserLabel: string
  otherUserName: string
  otherUserArea: string | null
  status: string
  listingType: string
  dueDaysLeft: number | null
  actions?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-4">
      <div className="flex gap-4">
        {/* Cover thumbnail */}
        <div className="w-14 h-20 rounded-lg overflow-hidden bg-brand-slate-light flex-shrink-0 border border-white/5">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt={title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-lg font-bold">
              {title[0]?.toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-white font-semibold leading-snug">{title}</h3>
            <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${STATUS_PILL[status] || 'bg-white/5 text-slate-400 border-white/10'}`}>
              {STATUS_LABEL[status] || status}
            </span>
          </div>

          <p className="text-sm text-slate-400 mb-2">
            {otherUserLabel}{' '}
            <Link href={`/user/${otherUserId}`} className="text-brand-teal-light hover:text-teal-300 hover:underline">
              {otherUserName}
            </Link>
            {otherUserArea && <span className="text-slate-500"> · 📍 {otherUserArea}</span>}
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="max-w-[220px]">
              <RequestStepper status={status} listingType={listingType} />
            </div>
            <DueBadge daysLeft={dueDaysLeft} />
          </div>
        </div>
      </div>

      {actions && <div className="flex items-center gap-2 flex-wrap pl-[4.5rem]">{actions}</div>}

      {footer}
    </div>
  )
}
