import * as Sentry from '@sentry/nextjs'

// No-ops safely if NEXT_PUBLIC_SENTRY_DSN is unset, same convention as
// RESEND_API_KEY elsewhere in this codebase (Chapter 20 of the manual).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // Error capture is the whole point here; tracing is off by default so a
      // low-traffic launch doesn't burn through Sentry's transaction quota.
      // Raise this once there's a reason to look at performance data too.
      tracesSampleRate: 0,
    })
  }
}

export const onRequestError = Sentry.captureRequestError
