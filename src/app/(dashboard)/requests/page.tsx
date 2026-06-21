"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createNotification } from '@/lib/notifications'
import { useRouter } from 'next/navigation'
import RatingModal from '@/components/rating-modal'

// FIXED: Removed the [] from books and profiles. 
// Since a request belongs to ONE book and ONE user, Supabase returns them as single objects, not arrays.
type BookRequest = {
  id: string
  status: string
  created_at: string
  requester_id: string
  book_id: string
  books: { title: string; owner_id: string; listing_type: string }
  profiles: { display_name: string | null; area_name: string | null }
}

export default function RequestsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [incomingRequests, setIncomingRequests] = useState<BookRequest[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<BookRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [ratedRequests, setRatedRequests] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [ratingTarget, setRatingTarget] = useState<{
    requestId: string; raterId: string; ratedUserId: string; ratedUserName: string; bookTitle: string
  } | null>(null)

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    setLoading(true)
    await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    const { data: myRatings } = await supabase
      .from('ratings')
      .select('request_id')
      .eq('rater_id', user.id)
    if (myRatings) {
      setRatedRequests(new Set(myRatings.map(r => r.request_id)))
    }

    // 1. Fetch OUTGOING requests (requests I made to others)
    const { data: outgoingData, error: outError } = await supabase
      .from('book_requests')
      .select('id, status, created_at, requester_id, book_id, books(title, owner_id, listing_type), profiles(display_name, area_name)')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })

    if (outError) console.error('Outgoing error:', outError)
    if (outgoingData) setOutgoingRequests(outgoingData as any)

    // 2. Find the IDs of all books I own
    const { data: myBooksData } = await supabase
      .from('books')
      .select('id')
      .eq('owner_id', user.id)
    
    const myBookIds = myBooksData?.map(b => b.id) || []

    // 3. Fetch INCOMING requests (requests for books I own)
    let incomingData = null
    if (myBookIds.length > 0) {
      const { data, error: incError } = await supabase
        .from('book_requests')
        .select('id, status, created_at, requester_id, book_id, books(title, owner_id, listing_type), profiles(display_name, area_name)')
        .in('book_id', myBookIds)
        .order('created_at', { ascending: false })

      if (incError) console.error('Incoming error:', incError)
      incomingData = data
    } 

    if (incomingData) {
      setIncomingRequests(incomingData as any)
    } else {
      setIncomingRequests([])
    }

    setLoading(false)
  }

  const handleUpdateStatus = async (requestId: string, newStatus: string) => {
    const { error } = await supabase
      .from('book_requests')
      .update({ status: newStatus })
      .eq('id', requestId)

    if (error) {
      alert('Error updating request: ' + error.message)
    } else {
      const req = incomingRequests.find(r => r.id === requestId)
      if (req) {
        await createNotification({
          userId: req.requester_id,
          type: newStatus === 'accepted' ? 'request_accepted' : 'request_declined',
          title: newStatus === 'accepted'
            ? `Your request for "${req.books?.title}" was accepted!`
            : `Your request for "${req.books?.title}" was declined`,
          link: '/requests',
        })
      }
      fetchRequests()
    }
  }

  const handleMessage = (requestId: string) => {
    router.push(`/messages/${requestId}`)
  }

  const handleHandover = async (req: BookRequest) => {
    const updates: Record<string, unknown> = { status: 'handed_over', handed_over_at: new Date().toISOString() }
    if (req.books?.listing_type === 'donate') {
      updates.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('book_requests')
      .update(updates)
      .eq('id', req.id)

    if (error) { alert('Error: ' + error.message); return }

    if (req.books?.listing_type === 'donate') {
      await supabase.from('books').update({ status: 'given' }).eq('id', req.book_id)
    } else {
      await supabase.from('books').update({ status: 'unavailable' }).eq('id', req.book_id)
    }

    const { data: { user } } = await supabase.auth.getUser()
    const otherId = user?.id === req.requester_id ? req.books?.owner_id : req.requester_id
    if (otherId) {
      await createNotification({
        userId: otherId,
        type: 'handover_confirmed',
        title: `Handover confirmed for "${req.books?.title}"`,
        link: '/requests',
      })
    }

    fetchRequests()
  }

  const handleReturn = async (req: BookRequest) => {
    const { error } = await supabase
      .from('book_requests')
      .update({ status: 'returned', completed_at: new Date().toISOString() })
      .eq('id', req.id)

    if (error) { alert('Error: ' + error.message); return }

    await supabase.from('books').update({ status: 'available' }).eq('id', req.book_id)

    const { data: { user } } = await supabase.auth.getUser()
    const otherId = user?.id === req.requester_id ? req.books?.owner_id : req.requester_id
    if (otherId) {
      await createNotification({
        userId: otherId,
        type: 'book_returned',
        title: `"${req.books?.title}" has been marked as returned`,
        link: '/requests',
      })
    }

    fetchRequests()
  }

  if (loading) return <p className="text-slate-400">Loading requests...</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Book Requests</h1>
      <p className="text-slate-400 mb-8">Manage incoming and outgoing book requests</p>

      {/* Incoming Requests */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold mb-4">📩 Incoming Requests</h2>
        {incomingRequests.length === 0 ? (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-center text-slate-500">
            No one has requested your books yet.
          </div>
        ) : (
          <div className="space-y-4">
            {incomingRequests.map((req) => (
              <div key={req.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  {/* FIXED: Now accessing the object directly without [0] */}
                  <p className="text-white font-semibold">
                    {req.books?.title || "Unknown Book"}
                  </p>
                  <p className="text-sm text-slate-400">
                    Requested by <span className="text-teal-400">{req.profiles?.display_name || "Unknown User"}</span>
                    {req.profiles?.area_name && (
                      <span className="text-slate-500"> from {req.profiles.area_name}</span>
                    )}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                  {req.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(req.id, 'accepted')}
                        className="bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(req.id, 'declined')}
                        className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {req.status === 'accepted' && (
                    <>
                      <button
                        onClick={() => handleHandover(req)}
                        className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        🤝 Confirm Handover
                      </button>
                      <button
                        onClick={() => handleMessage(req.id)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        💬 Message
                      </button>
                    </>
                  )}
                  {req.status === 'handed_over' && req.books?.listing_type === 'donate' && (
                    <>
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">Donated ✓</span>
                      {currentUserId && !ratedRequests.has(req.id) && (
                        <button onClick={() => setRatingTarget({ requestId: req.id, raterId: currentUserId, ratedUserId: req.requester_id, ratedUserName: req.profiles?.display_name || 'User', bookTitle: req.books?.title || '' })}
                          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
                      )}
                    </>
                  )}
                  {req.status === 'handed_over' && req.books?.listing_type === 'lend' && (
                    <>
                      <button
                        onClick={() => handleReturn(req)}
                        className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        📗 Mark Returned
                      </button>
                      <button
                        onClick={() => handleMessage(req.id)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        💬 Message
                      </button>
                    </>
                  )}
                  {req.status === 'returned' && (
                    <>
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Returned ✓</span>
                      {currentUserId && !ratedRequests.has(req.id) && (
                        <button onClick={() => setRatingTarget({ requestId: req.id, raterId: currentUserId, ratedUserId: req.requester_id, ratedUserName: req.profiles?.display_name || 'User', bookTitle: req.books?.title || '' })}
                          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
                      )}
                    </>
                  )}
                  {req.status === 'declined' && (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Declined ✗</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing Requests */}
      <div>
        <h2 className="text-xl font-semibold mb-4">📤 Outgoing Requests</h2>
        {outgoingRequests.length === 0 ? (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-center text-slate-500">
            You haven't requested any books yet.
          </div>
        ) : (
          <div className="space-y-4">
            {outgoingRequests.map((req) => (
              <div key={req.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                {/* FIXED: Now accessing the object directly without [0] */}
                <p className="text-white font-semibold">{req.books?.title || "Unknown Book"}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {req.status === 'pending' && (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending...</span>
                  )}
                  {req.status === 'accepted' && (
                    <>
                      <button
                        onClick={() => handleHandover(req)}
                        className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        🤝 Confirm Handover
                      </button>
                      <button
                        onClick={() => handleMessage(req.id)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        💬 Message
                      </button>
                    </>
                  )}
                  {req.status === 'handed_over' && req.books?.listing_type === 'donate' && (
                    <>
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">Received ✓</span>
                      {currentUserId && !ratedRequests.has(req.id) && (
                        <button onClick={() => setRatingTarget({ requestId: req.id, raterId: currentUserId, ratedUserId: req.books?.owner_id, ratedUserName: 'the owner', bookTitle: req.books?.title || '' })}
                          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
                      )}
                    </>
                  )}
                  {req.status === 'handed_over' && req.books?.listing_type === 'lend' && (
                    <>
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">In your possession</span>
                      <button
                        onClick={() => handleReturn(req)}
                        className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        📗 Mark Returned
                      </button>
                      <button
                        onClick={() => handleMessage(req.id)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        💬 Message
                      </button>
                    </>
                  )}
                  {req.status === 'returned' && (
                    <>
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Returned ✓</span>
                      {currentUserId && !ratedRequests.has(req.id) && (
                        <button onClick={() => setRatingTarget({ requestId: req.id, raterId: currentUserId, ratedUserId: req.books?.owner_id, ratedUserName: 'the owner', bookTitle: req.books?.title || '' })}
                          className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">⭐ Rate</button>
                      )}
                    </>
                  )}
                  {req.status === 'declined' && (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Declined ✗</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {ratingTarget && (
        <RatingModal
          {...ratingTarget}
          onClose={() => setRatingTarget(null)}
          onSubmitted={() => {
            setRatedRequests(prev => new Set(prev).add(ratingTarget.requestId))
            setRatingTarget(null)
          }}
        />
      )}
    </div>
  )
}