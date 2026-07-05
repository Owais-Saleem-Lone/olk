"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { NOTIFICATION_ICONS as ICONS } from '@/lib/notification-icons'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export default function NotificationsPage() {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) setNotifications(data)
    setLoading(false)
  }

  useEffect(() => { queueMicrotask(() => fetchAll()) }, [])

  const markAllRead = async () => {
    const ids = notifications.filter(n => !n.read).map(n => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read: true }).in('id', ids)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  if (loading) return <p className="text-slate-400">Loading notifications...</p>

  const unread = notifications.filter(n => !n.read).length

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Notifications</h1>
          <p className="text-slate-400">{unread > 0 ? `${unread} unread` : 'All caught up!'}</p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-teal-400 hover:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 px-4 py-2 rounded-lg transition-colors self-start"
          >
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">🔔</div>
          <h2 className="text-lg font-semibold mb-2">No notifications yet</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            You&apos;ll be notified when someone requests your book, accepts a request, or sends you a message.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Link
              key={n.id}
              href={n.link || '#'}
              onClick={() => { if (!n.read) markRead(n.id) }}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                !n.read
                  ? 'bg-teal-500/[0.04] border-teal-500/10 hover:border-teal-500/20'
                  : 'bg-white/[0.02] border-white/[0.06] hover:border-white/10'
              }`}
            >
              <span className="text-xl flex-shrink-0">{ICONS[n.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${!n.read ? 'text-white font-medium' : 'text-slate-300'}`}>
                  {n.title}
                </p>
                {n.body && <p className="text-xs text-slate-500 mt-1">{n.body}</p>}
                <p className="text-xs text-slate-600 mt-2">{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0 mt-2" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
