// Single source of truth for the OLK brand colors used in transactional
// email HTML (send-notification-email.ts, api/digest/route.ts). Email
// clients need inline hex, so these can't be CSS custom properties like the
// app's own --color-brand-* tokens (globals.css) — but every email template
// should still pull from here rather than retyping the hex values.
export const EMAIL_BRAND = {
  bg: '#0f172a',
  cardText: '#f1f5f9',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  textFooter: '#475569',
  tealGradientFrom: '#2dd4bf',
  tealGradientTo: '#0d9488',
  teal: '#14b8a6',
} as const
