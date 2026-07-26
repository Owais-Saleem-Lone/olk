'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Announcement = {
  id: string
  title: string
  body: string | null
  type: string
}

const typeStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '📢' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '⚠️' },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: '✅' },
  event: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', icon: '🎉' },
}

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('announcements')
      .select('id, title, body, type')
      .eq('active', true)
      .eq('is_banner', true)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data) setAnnouncements(data)
      })
  }, [])

  if (announcements.length === 0) return null

  return (
    <div className="space-y-2 mb-6">
      {announcements.map(a => {
        const style = typeStyles[a.type] || typeStyles.info
        return (
          <div key={a.id} className={`${style.bg} border ${style.border} rounded-xl px-4 py-3 flex items-start gap-3 shadow-sm`}>
            <span className="text-lg flex-shrink-0 mt-0.5">{style.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${style.text}`}>{a.title}</p>
              {a.body && <p className="text-xs text-slate-600 mt-0.5">{a.body}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
