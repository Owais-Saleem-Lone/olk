'use client'

import { useSyncExternalStore } from 'react'

type Toast = { id: number; message: string; variant: 'error' | 'success' }

let toasts: Toast[] = []
let nextId = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function show(message: string, variant: Toast['variant']) {
  const id = nextId++
  toasts = [...toasts, { id, message, variant }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 5000)
}

// Fire-and-forget toast API, usable from any client component without a
// Provider — replaces the scattered window.alert() calls across dashboard
// pages with a consistent, non-blocking notice.
export const toast = {
  error: (message: string) => show(message, 'error'),
  success: (message: string) => show(message, 'success'),
}

export function useToasts() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => toasts,
    () => toasts
  )
}
