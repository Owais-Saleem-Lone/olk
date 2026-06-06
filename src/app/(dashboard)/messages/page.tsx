"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type ConversationItem = {
  requestId: string
  bookTitle: string
  otherUserName: string | null
  otherUserArea: string | null
  lastMessage: string | null
}

export default function MessagesPage() {
  const supabase = createClient()
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchConversations()
  }, [])

  const fetchConversations = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Accepted requests I made (I'm the requester, other user is the book owner)
    const { data: outgoing } = await supabase
      .from('book_requests')
      .select('id, books(title, owner_id)')
      .eq('requester_id', user.id)
      .eq('status', 'accepted')

    // Accepted requests on my books (I'm the owner, other user is the requester)
    const { data: myBooks } = await supabase
      .from('books')
      .select('id')
      .eq('owner_id', user.id)

    const myBookIds = myBooks?.map(b => b.id) || []

    const { data: incoming } = myBookIds.length > 0
      ? await supabase
          .from('book_requests')
          .select('id, requester_id, books(title), profiles(display_name, area_name)')
          .in('book_id', myBookIds)
          .eq('status', 'accepted')
      : { data: [] }

    // Fetch owner profiles for outgoing requests in one batch
    const ownerIds = (outgoing || []).map((r: any) => r.books?.owner_id).filter(Boolean)
    const { data: ownerProfiles } = ownerIds.length > 0
      ? await supabase.from('profiles').select('id, display_name, area_name').in('id', ownerIds)
      : { data: [] }

    const ownerMap: Record<string, { display_name: string | null; area_name: string | null }> = {}
    ownerProfiles?.forEach((p: any) => { ownerMap[p.id] = p })

    // Collect all request IDs so we can batch-fetch last messages
    const allRequestIds = [
      ...(outgoing || []).map((r: any) => r.id),
      ...(incoming || []).map((r: any) => r.id),
    ]

    const lastMessageMap: Record<string, string> = {}
    for (const rid of allRequestIds) {
      const { data: msg } = await supabase
        .from('messages')
        .select('content')
        .eq('request_id', rid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (msg) lastMessageMap[rid] = msg.content
    }

    const convs: ConversationItem[] = [
      ...(outgoing || []).map((req: any) => ({
        requestId: req.id,
        bookTitle: req.books?.title || 'Unknown Book',
        otherUserName: ownerMap[req.books?.owner_id]?.display_name ?? null,
        otherUserArea: ownerMap[req.books?.owner_id]?.area_name ?? null,
        lastMessage: lastMessageMap[req.id] ?? null,
      })),
      ...(incoming || []).map((req: any) => ({
        requestId: req.id,
        bookTitle: req.books?.title || 'Unknown Book',
        otherUserName: req.profiles?.display_name ?? null,
        otherUserArea: req.profiles?.area_name ?? null,
        lastMessage: lastMessageMap[req.id] ?? null,
      })),
    ]

    setConversations(convs)
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400">Loading messages...</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Messages</h1>
      <p className="text-slate-400 mb-8">Your conversations about books</p>

      {conversations.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">💬</div>
          <h2 className="text-lg font-semibold mb-2">No conversations yet</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Once a book request is accepted, a Message button will appear on the Requests page.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map(conv => (
            <Link
              key={conv.requestId}
              href={`/messages/${conv.requestId}`}
              className="block bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 hover:border-teal-500/30 transition-colors"
            >
              <p className="font-semibold text-white">
                {conv.otherUserName || 'Anonymous'}
              </p>
              {conv.otherUserArea && (
                <p className="text-xs text-slate-500 mt-0.5">📍 {conv.otherUserArea}</p>
              )}
              <p className="text-xs text-slate-600 mt-1">📖 {conv.bookTitle}</p>
              {conv.lastMessage ? (
                <p className="text-sm text-slate-400 mt-2 truncate">{conv.lastMessage}</p>
              ) : (
                <p className="text-sm text-slate-600 mt-2 italic">No messages yet</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
