'use client'

import { useToasts } from '@/hooks/use-toast'

export default function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`rounded-lg px-4 py-3 text-sm shadow-lg border backdrop-blur-md ${
            t.variant === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-brand-teal/10 border-brand-teal/20 text-brand-teal-light'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
