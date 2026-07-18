"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { toast } from '@/hooks/use-toast'
import { wordCount } from '@/lib/text-limits'
import { compressImage } from '@/lib/image-utils'
import { CLUB_INTERESTS } from '@/lib/club-interests'
import Link from 'next/link'
import CoverInput from '@/components/my-books/cover-input'

// Kept outside the component: Date.now() is an impure call the React
// Compiler's purity check flags wherever it's written, even though this one
// only ever runs from an upload event handler, never during render.
function timestampedPath(userId: string, ext: string | undefined) {
  return `${userId}/${Date.now()}.${ext}`
}

type MyRequest = {
  id: string
  name: string
  status: 'pending' | 'approved' | 'rejected'
  review_note: string | null
  created_club_id: string | null
  created_at: string
}

export default function CreateClubPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [eligible, setEligible] = useState<boolean | null>(null)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [hasReports, setHasReports] = useState(false)
  const [latestRequest, setLatestRequest] = useState<MyRequest | null>(null)

  const [name, setName] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [targetMembers, setTargetMembers] = useState('')
  const [areaName, setAreaName] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

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

    const { data: myRequests } = await supabase
      .from('club_requests')
      .select('id, name, status, review_note, created_club_id, created_at')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
    setLatestRequest(myRequests?.[0] ?? null)

    setLoading(false)
  }, [supabase])

  useAsyncEffect(() => checkEligibility(), [checkEligibility])

  const toggleInterest = (interest: string) => {
    setInterests(prev => prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be smaller than 5MB'); return }
    setCoverFile(file)
    setCoverUrl('')
    const reader = new FileReader()
    reader.onload = (ev) => setCoverPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const uploadCover = async (file: File, userId: string) => {
    const compressed = await compressImage(file)
    const ext = compressed.name.split('.').pop()
    const path = timestampedPath(userId, ext)
    const { error } = await supabase.storage.from('club-covers').upload(path, compressed)
    if (error) return { url: null, error: error.message }
    const { data } = supabase.storage.from('club-covers').getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  }

  const nameWords = wordCount(name)
  const descWords = wordCount(description)
  const goalWords = wordCount(goal)
  const targetWords = wordCount(targetMembers)
  const overLimit = nameWords > 10 || descWords > 200 || goalWords > 50 || targetWords > 50

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !description.trim() || interests.length === 0 || overLimit || submitting) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    let finalCoverUrl: string | null = coverUrl.trim() || null
    if (coverFile) {
      const { url, error } = await uploadCover(coverFile, user.id)
      if (error) { toast.error('Cover upload failed: ' + error); setSubmitting(false); return }
      finalCoverUrl = url
    }

    const { error } = await supabase.from('club_requests').insert({
      requester_id: user.id,
      name: name.trim(),
      interests,
      description: description.trim(),
      goal: goal.trim() || null,
      target_members: targetMembers.trim() || null,
      area_name: areaName.trim() || null,
      latitude,
      longitude,
      cover_url: finalCoverUrl,
    })

    if (error) {
      toast.error('Error submitting request: ' + error.message)
      setSubmitting(false)
      return
    }

    toast.success('Your request has been submitted for review!')
    setName(''); setInterests([]); setDescription(''); setGoal(''); setTargetMembers('')
    setCoverFile(null); setCoverUrl(''); setCoverPreview('')
    await checkEligibility()
    setSubmitting(false)
  }

  const handleWithdraw = async () => {
    if (!latestRequest || withdrawing) return
    setWithdrawing(true)
    await supabase.from('club_requests').delete().eq('id', latestRequest.id)
    await checkEligibility()
    setWithdrawing(false)
  }

  if (loading) return <p className="text-slate-400 text-center py-20">Checking eligibility...</p>

  if (!eligible) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="text-5xl mb-4">🏘️</div>
        <h1 className="text-2xl font-bold mb-3">Not eligible to request a club yet</h1>
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

  if (latestRequest?.status === 'pending') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold mb-3">Your request is under review</h1>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-left mb-6">
          <p className="text-sm text-white font-semibold mb-1">{latestRequest.name}</p>
          <p className="text-xs text-slate-500">
            Submitted {new Date(latestRequest.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} — an admin will approve or reject it soon.
          </p>
        </div>
        <button
          onClick={handleWithdraw}
          disabled={withdrawing}
          className="text-sm text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-50 mb-6"
        >
          {withdrawing ? 'Withdrawing...' : 'Withdraw this request'}
        </button>
        <div>
          <Link href="/clubs" className="text-sm text-brand-teal-light hover:text-teal-300">← Back to Clubs</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-2">Request a Club</h1>
      <p className="text-slate-400 mb-6">Start a local interest group for readers near you — an admin will review your request before it goes live.</p>

      {latestRequest?.status === 'rejected' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-300 font-medium mb-1">Your last request, &quot;{latestRequest.name}&quot;, was not approved.</p>
          {latestRequest.review_note && (
            <p className="text-xs text-slate-400">Admin note: {latestRequest.review_note}</p>
          )}
          <p className="text-xs text-slate-500 mt-2">Feel free to address the feedback and submit a new request below.</p>
        </div>
      )}

      {latestRequest?.status === 'approved' && latestRequest.created_club_id && (
        <div className="bg-brand-teal/10 border border-brand-teal/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-brand-teal-light">
            You already run{' '}
            <Link href={`/clubs/${latestRequest.created_club_id}`} className="underline hover:text-teal-300">
              &quot;{latestRequest.name}&quot;
            </Link>
            . You can still request another club below.
          </p>
        </div>
      )}

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-300">Club Name</label>
              <span className={`text-xs ${nameWords > 10 ? 'text-red-400' : 'text-slate-600'}`}>{nameWords}/10 words</span>
            </div>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal ${nameWords > 10 ? 'border-red-500/50' : 'border-white/10'}`}
              placeholder="e.g., English Fiction Club Anantnag" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Categories</label>
            <div className="grid grid-cols-2 gap-2">
              {CLUB_INTERESTS.map(interest => (
                <label key={interest} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={interests.includes(interest)} onChange={() => toggleInterest(interest)} className="accent-brand-teal" />
                  {interest}
                </label>
              ))}
            </div>
            {interests.length === 0 && <p className="text-xs text-slate-500 mt-1.5">Pick at least one category.</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-300">Description</label>
              <span className={`text-xs ${descWords > 200 ? 'text-red-400' : 'text-slate-600'}`}>{descWords}/200 words</span>
            </div>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4}
              className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none ${descWords > 200 ? 'border-red-500/50' : 'border-white/10'}`}
              placeholder="What's your club about? What will members actually do together?" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-300">Goal <span className="text-slate-500 font-normal">(optional)</span></label>
              <span className={`text-xs ${goalWords > 50 ? 'text-red-400' : 'text-slate-600'}`}>{goalWords}/50 words</span>
            </div>
            <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2}
              className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none ${goalWords > 50 ? 'border-red-500/50' : 'border-white/10'}`}
              placeholder="What do you want this club to achieve?" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-300">Target Members <span className="text-slate-500 font-normal">(optional)</span></label>
              <span className={`text-xs ${targetWords > 50 ? 'text-red-400' : 'text-slate-600'}`}>{targetWords}/50 words</span>
            </div>
            <textarea value={targetMembers} onChange={e => setTargetMembers(e.target.value)} rows={2}
              className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none ${targetWords > 50 ? 'border-red-500/50' : 'border-white/10'}`}
              placeholder="Who are you hoping will join? e.g. college students who love poetry" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Cover Image <span className="text-slate-500 font-normal">(optional)</span></label>
            <CoverInput
              preview={coverPreview}
              onFileChange={handleFileChange}
              onUrlChange={(v) => { setCoverUrl(v); setCoverFile(null); setCoverPreview(v) }}
              urlValue={coverUrl}
              onClear={() => { setCoverFile(null); setCoverUrl(''); setCoverPreview('') }}
            />
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

          <button type="submit" disabled={submitting || !name.trim() || !description.trim() || interests.length === 0 || overLimit}
            className="w-full bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors">
            {submitting ? 'Submitting...' : 'Submit for Review'}
          </button>
        </form>
      </div>
    </div>
  )
}
