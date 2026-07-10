import type { BookRequest } from './types'

export default function ReadingProgressFooter({
  req,
  progress,
  onProgressChange,
  onSaveProgress,
  saving,
  isConfirmingComplete,
  onConfirmComplete,
  onCancelComplete,
  onComplete,
  completing,
}: {
  req: BookRequest
  progress: number
  onProgressChange: (pct: number) => void
  onSaveProgress: () => void
  saving: boolean
  isConfirmingComplete: boolean
  onConfirmComplete: () => void
  onCancelComplete: () => void
  onComplete: () => void
  completing: boolean
}) {
  if (req.status !== 'handed_over') return null

  return (
    <div className="border-t border-white/[0.05] pt-3 space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">📖 Reading progress</span>
          <span className="text-xs text-brand-teal-light font-semibold tabular-nums">
            {progress}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={e => onProgressChange(parseInt(e.target.value))}
            className="flex-1 accent-brand-teal cursor-pointer"
          />
          <button
            onClick={onSaveProgress}
            disabled={saving}
            className="text-xs bg-brand-teal/10 text-brand-teal-light border border-brand-teal/20 hover:bg-brand-teal/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Visible to the community in Browse Books
        </p>
      </div>

      {/* Completion actions — appear only at 100% */}
      {progress === 100 && req.books?.listing_type === 'donate' && (
        <div className="bg-brand-teal/[0.05] border border-brand-teal/20 rounded-xl px-4 py-3">
          {isConfirmingComplete ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-slate-300 flex-1">
                The book will move to <span className="text-white font-medium">your My Books</span> as available — ready to pass on to the next reader.
              </p>
              <button
                onClick={onComplete}
                disabled={completing}
                className="text-xs bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {completing ? 'Processing...' : 'Yes, pass it on'}
              </button>
              <button
                onClick={onCancelComplete}
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
                onClick={onConfirmComplete}
                className="text-xs bg-brand-teal/20 hover:bg-brand-teal/30 text-teal-300 border border-brand-teal/30 font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                Complete Reading
              </button>
            </div>
          )}
        </div>
      )}

      {progress === 100 && req.books?.listing_type === 'lend' && (
        <p className="text-xs text-blue-400 bg-blue-500/[0.05] border border-blue-500/20 rounded-xl px-4 py-3">
          📚 Reading complete! Please return the book to its owner when ready.
        </p>
      )}
    </div>
  )
}
