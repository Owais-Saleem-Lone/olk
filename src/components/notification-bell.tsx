"use client"

import { useState, useEffect, useRef } from 'react'
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

function randomInstanceId() {
  return Math.random().toString(36).slice(2, 8)
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export default function NotificationBell() {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const instanceId = useRef(randomInstanceId())

  useEffect(() => {
    let aborted = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    const channelName = `notif:${instanceId.current}:${Date.now()}`

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || aborted) return

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (aborted) return
      if (data) {
        setNotifications(data)
        setUnreadCount(data.filter((n: Notification) => !n.read).length)
      }

      const ch = supabase.channel(channelName)
      ch.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as Notification
        setNotifications(prev => [n, ...prev].slice(0, 20))
        setUnreadCount(prev => prev + 1)
      })

      if (aborted) { supabase.removeChannel(ch); return }
      ch.subscribe()
      channel = ch
    }

    init()
    return () => {
      aborted = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const markAllRead = async () => {
    const ids = notifications.filter(n => !n.read).map(n => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read: true }).in('id', ids)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-slate-950 px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-teal-400 hover:text-teal-300 transition-colors">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-600 text-sm">No notifications yet</div>
            ) : (
              notifications.slice(0, 10).map(n => (
                <Link
                  key={n.id}
                  href={n.link || '/notifications'}
                  onClick={() => {
                    setOpen(false)
                    if (!n.read) {
                      supabase.from('notifications').update({ read: true }).eq('id', n.id)
                      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
                      setUnreadCount(prev => Math.max(0, prev - 1))
                    }
                  }}
                  className={`block px-4 py-3 hover:bg-white/[0.04] transition-colors border-b border-white/[0.03] last:border-b-0 ${!n.read ? 'bg-teal-500/[0.04]' : ''}`}
                >
                  <div className="flex gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">{ICONS[n.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.read ? 'text-white font-medium' : 'text-slate-400'}`}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-xs text-slate-600 truncate mt-0.5">{n.body}</p>}
                      <p className="text-xs text-slate-700 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0 mt-1.5" />}
                  </div>
                </Link>
              ))
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-xs text-slate-500 hover:text-white py-3 border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  )
}
