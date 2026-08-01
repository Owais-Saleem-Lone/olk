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
      // Turbopack emits server/edge stack frames for app code as bare
      // relative paths ("src/app/.../route.ts"), which collides with the
      // SDK's node-internal heuristic (anything without a leading "/", ".",
      // drive letter, or protocol is assumed to be a Node internal like
      // "node:internal/process/execution") and gets marked in_app: false --
      // so every real error renders as an undifferentiated wall of frames
      // with your own code not highlighted. Correct it back for anything
      // under our own source root.
      beforeSend(event) {
        for (const exception of event.exception?.values ?? []) {
          for (const frame of exception.stacktrace?.frames ?? []) {
            if (frame.filename?.startsWith('src/')) {
              // Sentry's backend recomputes in_app on ingest from the raw
              // filename and discards whatever the SDK sent -- a bare
              // relative path like "src/app/.../route.ts" fails its
              // absolute-path check and gets flagged out-of-app no matter
              // what in_app is set to here. Prefixing "/" is what actually
              // sticks.
              frame.filename = `/${frame.filename}`
              if (frame.abs_path) frame.abs_path = `/${frame.abs_path}`
              frame.in_app = true
            }
          }
        }
        return event
      },
    })
  }
}

export const onRequestError = Sentry.captureRequestError
