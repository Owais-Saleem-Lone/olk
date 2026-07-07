"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createNotification } from '@/lib/notifications'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Message = {
  id: string
  content: string
  sender_id: string
  created_at: string
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function ChatPage() {
  const supabase = createClient()
  const params = useParams()
  const requestId = params.id as string

  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [otherUser, setOtherUser] = useState<{ display_name: string | null; area_name: string | null } | null>(null)
  const [otherUserId, setOtherUserId] = useState<string | null>(null)
  const [bookTitle, setBookTitle] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchChat = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    const { data: req } = await supabase
      .from('book_requests')
      .select('requester_id, books(title, owner_id)')
      .eq('id', requestId)
      .single()

    if (req) {
      const books = req.books as unknown as { title: string; owner_id: string } | null
      setBookTitle(books?.title ?? null)
      const otherId = req.requester_id === user.id
        ? books?.owner_id
        : req.requester_id

      if (otherId) {
        setOtherUserId(otherId)
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, area_name')
          .eq('id', otherId)
          .maybeSingle()
        setOtherUser(profile)
      }
    }

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })

    if (data) setMessages(data)
    setLoading(false)
  }, [supabase, requestId])

  useEffect(() => {
    queueMicrotask(() => fetchChat())

    const channel = supabase
      .channel(`chat:${requestId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `request_id=eq.${requestId}` },
        (payload) => {
          const incoming = payload.new as Message
          setMessages(prev =>
            prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [requestId, fetchChat, supabase])

  const handleSend = async () => {
    if (!content.trim() || !currentUserId || sending) return
    setSending(true)

    const msgContent = content.trim()
    setContent('')

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({ request_id: requestId, sender_id: currentUserId, content: msgContent })
      .select()
      .single()

    if (error) {
      setContent(msgContent)
      if (error.message.startsWith('RATE_LIMIT_EXCEEDED:')) {
        alert("You've sent too many messages this hour. Please wait a bit before sending more.")
      }
    } else if (inserted) {
      setMessages(prev =>
        prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]
      )

      if (otherUserId) {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
        const { data: recentNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', otherUserId)
          .eq('type', 'new_message')
          .eq('link', `/messages/${requestId}`)
          .gte('created_at', fifteenMinAgo)
          .limit(1)

        if (!recentNotif || recentNotif.length === 0) {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', currentUserId)
            .single()

          await createNotification({
            userId: otherUserId,
            type: 'new_message',
            title: `${myProfile?.display_name || 'Someone'} sent a message about "${bookTitle}"`,
            link: `/messages/${requestId}`,
          })
        }
      }
    }

    setSending(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-slate-400">Loading chat...</p></div>

  // Build a list with date separators injected
  let lastDateLabel = ''
  const rendered: Array<{ type: 'separator'; label: string } | { type: 'message'; msg: Message }> = []
  for (const msg of messages) {
    const label = formatDateLabel(msg.created_at)
    if (label !== lastDateLabel) {
      rendered.push({ type: 'separator', label })
      lastDateLabel = label
    }
    rendered.push({ type: 'message', msg })
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/5">
        <Link href="/messages" className="text-slate-400 hover:text-white transition-colors text-xl leading-none">
          ←
        </Link>
        <Link href={otherUserId ? `/user/${otherUserId}` : '#'} className="w-10 h-10 rounded-full bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-brand-teal-light font-bold flex-shrink-0 hover:bg-brand-teal/20 transition-colors">
          {(otherUser?.display_name || '?')[0].toUpperCase()}
        </Link>
        <div>
          <h1 className="text-base font-semibold leading-tight">
            <Link href={otherUserId ? `/user/${otherUserId}` : '#'} className="hover:text-brand-teal-light transition-colors">
              {otherUser?.display_name || 'Anonymous'}
            </Link>
          </h1>
          <p className="text-xs text-slate-500">
            {otherUser?.area_name && <span>📍 {otherUser.area_name} · </span>}
            {bookTitle && <span>📚 {bookTitle}</span>}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1 pb-4 px-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3">👋</div>
            <p className="text-slate-500 text-sm">No messages yet — say hello!</p>
          </div>
        )}

        {rendered.map((item, i) => {
          if (item.type === 'separator') {
            return (
              <div key={`sep-${i}`} className="flex items-center gap-3 py-4">
                <div className="flex-1 h-px bg-white/[0.05]" />
                <span className="text-xs text-slate-600 px-2">{item.label}</span>
                <div className="flex-1 h-px bg-white/[0.05]" />
              </div>
            )
          }

          const { msg } = item
          const isMe = msg.sender_id === currentUserId
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
              <div className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2.5 ${
                isMe
                  ? 'bg-brand-teal text-white rounded-br-sm'
                  : 'bg-white/[0.06] text-white rounded-bl-sm'
              }`}>
                <p className="text-sm leading-relaxed">{msg.content}</p>
                <p className={`text-xs mt-1 ${isMe ? 'text-teal-100/60' : 'text-slate-600'}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); handleSend() }} className="flex gap-3 pt-4 border-t border-white/5">
        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
        />
        <button
          type="submit"
          disabled={!content.trim() || sending}
          className="bg-brand-teal hover:bg-brand-teal-light disabled:opacity-40 text-white font-semibold px-5 py-3 rounded-xl transition-colors flex items-center gap-2 text-sm"
        >
          Send
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
          </svg>
        </button>
      </form>
    </div>
  )
}
