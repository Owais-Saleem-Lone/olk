'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-white text-center px-4">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-slate-400 max-w-md">
        An unexpected error occurred. You can try again, or head back to the browse page.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => unstable_retry()}
          className="text-sm font-semibold bg-brand-teal hover:bg-brand-teal-light text-white px-4 py-2 rounded-lg transition-all"
        >
          Try again
        </button>
        <a
          href="/browse"
          className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
        >
          Go to Browse
        </a>
      </div>
    </div>
  )
}
