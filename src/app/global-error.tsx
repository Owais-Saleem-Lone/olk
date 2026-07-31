'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// error.tsx doesn't catch errors thrown by the root layout itself -- this is
// the only file convention that does, and it must define its own <html>/
// <body> since it replaces the root layout when active.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-white text-center px-4">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-slate-400 max-w-md">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => unstable_retry()}
          className="text-sm font-semibold bg-brand-teal hover:bg-brand-teal-light text-white px-4 py-2 rounded-lg transition-all"
        >
          Try again
        </button>
      </body>
    </html>
  )
}
