"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// UPDATED: Added [] to books and profiles to match Supabase's return format
type BookRequest = {
  id: string
  status: string
  created_at: string
  requester_id: string
  books: { title: string; owner_id: string }[]
  profiles: { display_name: string | null }[]
}

export default function RequestsPage() {
  const supabase = createClient()
  const [incomingRequests, setIncomingRequests] = useState<BookRequest[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<BookRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('book_requests')
      .select('id, status, created_at, requester_id, books(title, owner_id), profiles(display_name)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching requests:', error)
    } else if (data) {
      // Separate them into incoming (for my books) and outgoing (I requested)
      setIncomingRequests(data.filter((req) => req.books[0]?.owner_id === user.id))
      setOutgoingRequests(data.filter((req) => req.requester_id === user.id))
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
      fetchRequests()
    }
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
                  {/* Access the first item in the array [0] */}
                  <p className="text-white font-semibold">{req.books[0]?.title}</p>
                  <p className="text-sm text-slate-400">
                    Requested by <span className="text-teal-400">{req.profiles[0]?.display_name || 'A user'}</span>
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
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
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">Accepted ✓</span>
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
              <div key={req.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex justify-between items-center">
                {/* Access the first item in the array [0] */}
                <p className="text-white font-semibold">{req.books[0]?.title}</p>
                {req.status === 'pending' && (
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending...</span>
                )}
                {req.status === 'accepted' && (
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">Accepted ✓</span>
                )}
                {req.status === 'declined' && (
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Declined ✗</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}