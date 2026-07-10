"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { toast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const INTERESTS = [
  'English Fiction', 'Urdu Literature', 'Poetry', 'Science', 'History',
  'Philosophy', 'Art & Painting', 'Writing', 'Technology', 'Self-Help', 'General',
]

export default function CreateClubPage() {
  const supabase = createClient()
  const router = useRouter()

  const [eligible, setEligible] = useState<boolean | null>(null)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [hasReports, setHasReports] = useState(false)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [interest, setInterest] = useState('General')
  const [areaName, setAreaName] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const checkEligibility = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('area_name, latitude, longitude')
      .eq('id', user.id)
      .single()

    if (profile) {
      setAreaName(profile.area_name || '')
      setLatitude(profile.latitude ?? null)
      setLongitude(profile.longitude ?? null)
    }

    const { data: myBooks } = await supabase
      .from('books')
      .select('id')
      .eq('owner_id', user.id)

    const myBookIds = myBooks?.map(b => b.id) || []

    let completedCount = 0
    if (myBookIds.length > 0) {
      const { count: ownerExchanges } = await supabase
        .from('book_requests')
        .select('*', { count: 'exact', head: true })
        .in('book_id', myBookIds)
        .in('status', ['handed_over', 'returned'])

      completedCount += ownerExchanges || 0
    }

    const { count: requesterExchanges } = await supabase
      .from('book_requests')
      .select('*', { count: 'exact', head: true })
      .eq('requester_id', user.id)
      .in('status', ['handed_over', 'returned'])

    completedCount += requesterExchanges || 0
    setExchangeCount(completedCount)

    const { count: reportCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('reported_user_id', user.id)

    const userHasReports = (reportCount || 0) > 0
    setHasReports(userHasReports)
    setEligible(completedCount >= 5 && !userHasReports)
    setLoading(false)
  }, [supabase])

  useAsyncEffect(() => checkEligibility(), [checkEligibility])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreating(false); return }

    const { data: club, error } = await supabase.from('clubs').insert({
      name: name.trim(),
      description: description.trim() || null,
      interest,
      area_name: areaName.trim() || null,
      latitude,
      longitude,
      creator_id: user.id,
    }).select().single()

    if (error) {
      toast.error('Error creating club: ' + error.message)
      setCreating(false)
      return
    }

    await supabase.from('club_members').insert({
      club_id: club.id,
      user_id: user.id,
    })

    router.push(`/clubs/${club.id}`)
  }

  if (loading) return <p className="text-slate-400 text-center py-20">Checking eligibility...</p>

  if (!eligible) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="text-5xl mb-4">🏘️</div>
        <h1 className="text-2xl font-bold mb-3">Not eligible to create a club yet</h1>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-left space-y-4 mb-6">
          <div className="flex items-center gap-3">
            <span className={`text-lg ${exchangeCount >= 5 ? 'text-brand-teal-light' : 'text-slate-600'}`}>
              {exchangeCount >= 5 ? '✓' : '✗'}
            </span>
            <div>
              <p className="text-sm text-white">5+ completed exchanges</p>
              <p className="text-xs text-slate-500">You have {exchangeCount} so far</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-lg ${!hasReports ? 'text-brand-teal-light' : 'text-red-400'}`}>
              {!hasReports ? '✓' : '✗'}
            </span>
            <div>
              <p className="text-sm text-white">No reports of misconduct</p>
              <p className="text-xs text-slate-500">{hasReports ? 'You have been reported' : 'Clean record'}</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Keep sharing books and building trust — you&apos;ll be eligible soon!
        </p>
        <Link href="/clubs" className="text-sm text-brand-teal-light hover:text-teal-300">← Back to Clubs</Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-2">Create a Club</h1>
      <p className="text-slate-400 mb-8">Start a local interest group for readers near you</p>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Club Name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              placeholder="e.g., English Fiction Club Anantnag" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
              placeholder="What's your club about? Who should join?" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Interest / Category</label>
            <select value={interest} onChange={e => setInterest(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
              {INTERESTS.map(i => <option key={i} value={i} className="bg-brand-slate">{i}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Location</label>
            <input type="text" value={areaName} onChange={e => setAreaName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              placeholder="e.g., Anantnag" />
            <p className="text-xs text-slate-500 mt-1">
              {latitude ? 'GPS location will be used from your profile for nearby discovery.' : 'Set your location in Profile to enable nearby discovery.'}
            </p>
          </div>

          <button type="submit" disabled={creating || !name.trim()}
            className="w-full bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors">
            {creating ? 'Creating...' : 'Create Club'}
          </button>
        </form>
      </div>
    </div>
  )
}
