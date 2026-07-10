"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { toast } from '@/hooks/use-toast'
import { createNotification } from '@/lib/notifications'
import type { BookRequest } from '@/components/requests/types'

export function useRequests() {
  const supabase = createClient()
  const [incomingRequests, setIncomingRequests] = useState<BookRequest[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<BookRequest[]>([])
  const [ownerProfiles, setOwnerProfiles] = useState<Record<string, { display_name: string | null; area_name: string | null }>>({})
  const [loading, setLoading] = useState(true)
  const [ratedRequests, setRatedRequests] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [progressInputs, setProgressInputs] = useState<Record<string, number>>({})
  const [progressSaving, setProgressSaving] = useState<string | null>(null)
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null)
  const [completingRequest, setCompletingRequest] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
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
      .select('id, status, created_at, handed_over_at, requester_id, book_id, books(title, owner_id, listing_type, lending_duration_months, cover_url), profiles(display_name, area_name)')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })

    if (outError) console.error('Outgoing error:', outError)
    if (outgoingData) {
      const outgoing = outgoingData as unknown as BookRequest[]
      setOutgoingRequests(outgoing)

      // profiles(display_name, area_name) above resolves via requester_id, i.e. ME —
      // useless for outgoing cards. books.owner_id has no FK to profiles (only to
      // auth.users), so PostgREST can't embed it; batch-fetch owner profiles instead.
      const ownerIds = [...new Set(outgoing.map(r => r.books?.owner_id).filter(Boolean))]
      if (ownerIds.length > 0) {
        const { data: ownerProfileData } = await supabase
          .from('profiles')
          .select('id, display_name, area_name')
          .in('id', ownerIds)
        if (ownerProfileData) {
          const map: Record<string, { display_name: string | null; area_name: string | null }> = {}
          ownerProfileData.forEach((p) => { map[p.id] = p })
          setOwnerProfiles(map)
        }
      }

      // Fetch existing reading progress for handed-over outgoing requests
      const handedOverIds = outgoing
        .filter(r => r.status === 'handed_over')
        .map(r => r.id)
      if (handedOverIds.length > 0) {
        const { data: progressData } = await supabase
          .from('book_progress')
          .select('request_id, progress_pct')
          .in('request_id', handedOverIds)
          .eq('reader_id', user.id)
        if (progressData) {
          const inputs: Record<string, number> = {}
          progressData.forEach((p: { request_id: string; progress_pct: number }) => { inputs[p.request_id] = p.progress_pct })
          setProgressInputs(prev => ({ ...prev, ...inputs }))
        }
      }
    }

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
        .select('id, status, created_at, handed_over_at, requester_id, book_id, books(title, owner_id, listing_type, lending_duration_months, cover_url), profiles(display_name, area_name)')
        .in('book_id', myBookIds)
        .order('created_at', { ascending: false })

      if (incError) console.error('Incoming error:', incError)
      incomingData = data
    }

    if (incomingData) {
      setIncomingRequests(incomingData as unknown as BookRequest[])
    } else {
      setIncomingRequests([])
    }

    setLoading(false)
  }, [supabase])

  useAsyncEffect(() => fetchRequests(), [fetchRequests])

  const handleUpdateStatus = async (requestId: string, newStatus: string) => {
    const { error } = await supabase
      .from('book_requests')
      .update({ status: newStatus })
      .eq('id', requestId)

    if (error) {
      toast.error('Error updating request: ' + error.message)
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
          context: { kind: 'request', id: requestId },
        })
      }
      fetchRequests()
    }
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

    if (error) { toast.error('Error: ' + error.message); return }

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
        context: { kind: 'request', id: req.id },
      })
    }

    fetchRequests()
  }

  const handleReturn = async (req: BookRequest) => {
    const { error } = await supabase
      .from('book_requests')
      .update({ status: 'returned', completed_at: new Date().toISOString() })
      .eq('id', req.id)

    if (error) { toast.error('Error: ' + error.message); return }

    await supabase.from('books').update({ status: 'available' }).eq('id', req.book_id)

    const { data: { user } } = await supabase.auth.getUser()
    const otherId = user?.id === req.requester_id ? req.books?.owner_id : req.requester_id
    if (otherId) {
      await createNotification({
        userId: otherId,
        type: 'book_returned',
        title: `"${req.books?.title}" has been marked as returned`,
        link: '/requests',
        context: { kind: 'request', id: req.id },
      })
    }

    fetchRequests()
  }

  const handleCompleteReading = async (requestId: string) => {
    setCompletingRequest(requestId)
    const { error } = await supabase.rpc('complete_donated_book_reading', { p_request_id: requestId })
    if (error) toast.error('Error: ' + error.message)
    else { setConfirmComplete(null); fetchRequests() }
    setCompletingRequest(null)
  }

  const handleUpdateProgress = async (requestId: string, bookId: string) => {
    if (!currentUserId) return
    const pct = progressInputs[requestId] ?? 0
    setProgressSaving(requestId)
    const { error } = await supabase.from('book_progress').upsert({
      book_id: bookId,
      request_id: requestId,
      reader_id: currentUserId,
      progress_pct: pct,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'request_id' })
    if (error) toast.error('Error saving progress: ' + error.message)
    setProgressSaving(null)
  }

  return {
    incomingRequests,
    outgoingRequests,
    ownerProfiles,
    loading,
    ratedRequests,
    setRatedRequests,
    currentUserId,
    progressInputs,
    setProgressInputs,
    progressSaving,
    confirmComplete,
    setConfirmComplete,
    completingRequest,
    handleUpdateStatus,
    handleHandover,
    handleReturn,
    handleCompleteReading,
    handleUpdateProgress,
  }
}
