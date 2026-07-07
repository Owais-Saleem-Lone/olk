"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Conversation = {
  requestId: string
  bookTitle: string
  otherUserName: string | null
  otherUserArea: string | null
  lastMessage: string | null
  lastMessageAt: string | null
}

type OutgoingRequest = { id: string; books: { title: string; owner_id: string } | null }
type IncomingRequest = {
  id: string
  requester_id: string
  books: { title: string } | null
  profiles: { display_name: string | null; area_name: string | null } | null
}
type MessageRow = { request_id: string; content: string; created_at: string }

function timeAgo(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(isoString).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export default function MessagesPage() {
  const supabase = createClient()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Accepted requests I made (I'm the requester, other user is the book owner)
    const { data: outgoingData } = await supabase
      .from('book_requests')
      .select('id, books(title, owner_id)')
      .eq('requester_id', user.id)
      .eq('status', 'accepted')
    const outgoing = outgoingData as unknown as OutgoingRequest[] | null

    // Accepted requests on my books (I'm the owner, other user is the requester)
    const { data: myBooks } = await supabase
      .from('books')
      .select('id')
      .eq('owner_id', user.id)

    const myBookIds = myBooks?.map(b => b.id) || []

    const { data: incomingData } = myBookIds.length > 0
      ? await supabase
          .from('book_requests')
          .select('id, requester_id, books(title), profiles(display_name, area_name)')
          .in('book_id', myBookIds)
          .eq('status', 'accepted')
      : { data: [] }
    const incoming = incomingData as unknown as IncomingRequest[] | null

    // Batch-fetch owner profiles for outgoing requests
    const ownerIds = (outgoing || []).map((r) => r.books?.owner_id).filter(Boolean) as string[]
    const { data: ownerProfiles } = ownerIds.length > 0
      ? await supabase.from('profiles').select('id, display_name, area_name').in('id', ownerIds)
      : { data: [] }
    const ownerMap: Record<string, { display_name: string | null; area_name: string | null }> = {}
    ownerProfiles?.forEach((p) => { ownerMap[p.id] = p })

    // Batch-fetch last message for all conversations in one query
    const allRequestIds = [
      ...(outgoing || []).map((r) => r.id),
      ...(incoming || []).map((r) => r.id),
    ]

    const lastMsgMap: Record<string, { content: string; created_at: string }> = {}
    if (allRequestIds.length > 0) {
      const { data: allMsgsData } = await supabase
        .from('messages')
        .select('request_id, content, created_at')
        .in('request_id', allRequestIds)
        .order('created_at', { ascending: false })
      const allMsgs = allMsgsData as MessageRow[] | null

      allMsgs?.forEach((m) => {
        if (!lastMsgMap[m.request_id]) {
          lastMsgMap[m.request_id] = { content: m.content, created_at: m.created_at }
        }
      })
    }

    const convs: Conversation[] = [
      ...(outgoing || []).map((req) => ({
        requestId: req.id,
        bookTitle: req.books?.title || 'Unknown Book',
        otherUserName: req.books?.owner_id ? ownerMap[req.books.owner_id]?.display_name ?? null : null,
        otherUserArea: req.books?.owner_id ? ownerMap[req.books.owner_id]?.area_name ?? null : null,
        lastMessage: lastMsgMap[req.id]?.content ?? null,
        lastMessageAt: lastMsgMap[req.id]?.created_at ?? null,
      })),
      ...(incoming || []).map((req) => ({
        requestId: req.id,
        bookTitle: req.books?.title || 'Unknown Book',
        otherUserName: req.profiles?.display_name ?? null,
        otherUserArea: req.profiles?.area_name ?? null,
        lastMessage: lastMsgMap[req.id]?.content ?? null,
        lastMessageAt: lastMsgMap[req.id]?.created_at ?? null,
      })),
    ]

    // Sort by most recent message
    convs.sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0
      if (!a.lastMessageAt) return 1
      if (!b.lastMessageAt) return -1
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    })

    setConversations(convs)
    setLoading(false)
  }, [supabase])

  useEffect(() => { queueMicrotask(() => fetchConversations()) }, [fetchConversations])

  if (loading) return <p className="text-slate-400">Loading messages...</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Messages</h1>
      <p className="text-slate-400 mb-8">Your conversations about books</p>

      {conversations.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">💬</div>
          <h2 className="text-lg font-semibold mb-2">No conversations yet</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Once a book request is accepted, a Message button will appear on the Requests page to start the conversation.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => {
            const initials = (conv.otherUserName || '?')[0].toUpperCase()
            return (
              <Link
                key={conv.requestId}
                href={`/messages/${conv.requestId}`}
                className="flex items-center gap-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-brand-teal/20 rounded-2xl p-4 transition-colors group"
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-brand-teal-light font-bold text-lg flex-shrink-0">
                  {initials}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-white truncate">
                      {conv.otherUserName || 'Anonymous'}
                    </p>
                    {conv.lastMessageAt && (
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {timeAgo(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mb-1">📚 {conv.bookTitle}</p>
                  {conv.lastMessage ? (
                    <p className="text-sm text-slate-400 truncate">{conv.lastMessage}</p>
                  ) : (
                    <p className="text-sm text-slate-600 italic">No messages yet — say hello!</p>
                  )}
                </div>

                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
