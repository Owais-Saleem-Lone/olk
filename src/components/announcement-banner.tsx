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
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-300', icon: '📢' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-300', icon: '⚠️' },
  success: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-300', icon: '✅' },
  event: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-300', icon: '🎉' },
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
          <div key={a.id} className={`${style.bg} border ${style.border} rounded-xl px-4 py-3 flex items-start gap-3`}>
            <span className="text-lg flex-shrink-0 mt-0.5">{style.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${style.text}`}>{a.title}</p>
              {a.body && <p className="text-xs text-slate-400 mt-0.5">{a.body}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
