import * as Sentry from '@sentry/nextjs'

// No-ops safely if NEXT_PUBLIC_SENTRY_DSN is unset -- same convention as the
// server-side init in instrumentation.ts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  // Session replay is a separate, more expensive Sentry product -- left off
  // entirely rather than defaulting to a low sample rate that's easy to
  // forget is quietly running.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
