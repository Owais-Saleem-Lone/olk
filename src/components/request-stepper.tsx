const LEND_STEPS = [
  { key: 'pending', label: 'Requested' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'handed_over', label: 'Handed Over' },
  { key: 'returned', label: 'Returned' },
]

const DONATE_STEPS = [
  { key: 'pending', label: 'Requested' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'handed_over', label: 'Donated' },
]

export default function RequestStepper({ status, listingType }: { status: string; listingType: string }) {
  if (status === 'declined') {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-teal" />
          <span className="text-xs text-slate-400">Requested</span>
        </div>
        <span className="w-4 h-px bg-red-500/40" />
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-red-400 font-medium">Declined</span>
        </div>
      </div>
    )
  }

  const steps = listingType === 'donate' ? DONATE_STEPS : LEND_STEPS
  const currentIndex = steps.findIndex(s => s.key === status)

  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const done = currentIndex > i
        const current = currentIndex === i

        return (
          <div key={step.key} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  done ? 'bg-brand-teal' : current ? 'bg-brand-teal-light ring-4 ring-brand-teal/20' : 'bg-white/10'
                }`}
              />
              <span className={`text-[10px] whitespace-nowrap ${
                current ? 'text-brand-teal-light font-semibold' : done ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`flex-1 h-px mx-1.5 -mt-4 ${done ? 'bg-brand-teal/50' : 'bg-white/10'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
