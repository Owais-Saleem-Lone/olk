"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Message = {
  id: string
  content: string
  sender_id: string
  created_at: string
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
  const [bookTitle, setBookTitle] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchChat()

    const channel = supabase
      .channel(`chat:${requestId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `request_id=eq.${requestId}` },
        (payload) => {
          const incoming = payload.new as Message
          // Skip if we already added this message optimistically after our own send
          setMessages(prev =>
            prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [requestId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchChat = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    // Get the request to find the other participant and book title
    const { data: req } = await supabase
      .from('book_requests')
      .select('requester_id, books(title, owner_id)')
      .eq('id', requestId)
      .single()

    if (req) {
      setBookTitle((req.books as any)?.title ?? null)

      const otherId = req.requester_id === user.id
        ? (req.books as any)?.owner_id
        : req.requester_id

      if (otherId) {
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
  }

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
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
      setContent(msgContent) // restore on failure
    } else if (inserted) {
      // Add to state immediately — the realtime handler will skip it as a duplicate
      setMessages(prev =>
        prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]
      )
    }

    setSending(false)
  }

  if (loading) return <p className="text-slate-400">Loading...</p>

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/5">
        <Link href="/messages" className="text-slate-400 hover:text-white transition-colors text-xl leading-none">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-semibold leading-tight">
            {otherUser?.display_name || 'Anonymous'}
          </h1>
          <p className="text-xs text-slate-500">
            {otherUser?.area_name && <span>📍 {otherUser.area_name} · </span>}
            {bookTitle && <span>📖 {bookTitle}</span>}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4 px-1">
        {messages.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-12">
            No messages yet — say hello!
          </p>
        )}
        {messages.map(msg => {
          const isMe = msg.sender_id === currentUserId
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-teal-500 text-white rounded-br-sm'
                    : 'bg-white/[0.06] text-white rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-3 pt-4 border-t border-white/5">
        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          autoFocus
        />
        <button
          type="submit"
          disabled={!content.trim() || sending}
          className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}
