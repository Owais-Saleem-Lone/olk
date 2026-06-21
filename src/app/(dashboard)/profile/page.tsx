"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const supabase = createClient()
  const [displayName, setDisplayName] = useState('')
  const [areaName, setAreaName] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [emailDigest, setEmailDigest] = useState(true)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data) {
        setDisplayName(data.display_name || '')
        setAreaName(data.area_name || '')
        setLatitude(data.latitude ?? null)
        setLongitude(data.longitude ?? null)
        setEmailDigest(data.email_digest ?? true)
      }
    }
    setLoading(false)
  }

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      return
    }

    setLocating(true)
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setLocating(false)
      },
      (error) => {
        setLocating(false)
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Location access denied. Enable it in your browser settings.')
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationError('Unable to determine your location. Try again later.')
        } else {
          setLocationError('Location request timed out. Try again.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleRemoveLocation = () => {
    setLatitude(null)
    setLongitude(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      display_name: displayName,
      area_name: areaName,
      latitude,
      longitude,
      email_digest: emailDigest,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      setMessage('Error saving profile: ' + error.message)
    } else {
      setMessage('Profile saved successfully!')
    }
    setSaving(false)
  }

  if (loading) return <p className="text-slate-400">Loading profile...</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Your Profile</h1>
      <p className="text-slate-400 mb-8">Tell the community who you are and where you are located</p>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 max-w-lg">
        <form onSubmit={handleSave} className="space-y-5">

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g., Owais S."
            />
            <p className="text-xs text-slate-500 mt-1">This is visible to other users when they see your books</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Area / Locality</label>
            <input
              type="text"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g., Srinagar - Rajbagh"
            />
            <p className="text-xs text-slate-500 mt-1">Keep it approximate for privacy (no exact house numbers!)</p>
          </div>

          {/* Location Section */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Location</label>
            {latitude !== null && longitude !== null ? (
              <div className="flex items-center gap-3 bg-teal-500/10 border border-teal-500/20 rounded-lg px-4 py-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400 flex-shrink-0">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span className="text-sm text-teal-300 flex-1">Location saved</span>
                <button
                  type="button"
                  onClick={handleRemoveLocation}
                  className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={locating}
                className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-3 text-sm text-slate-300 hover:text-white transition-colors disabled:opacity-50"
              >
                {locating ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-teal-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Getting location...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                    Share my location
                  </>
                )}
              </button>
            )}
            {locationError && <p className="text-xs text-red-400 mt-1.5">{locationError}</p>}
            <p className="text-xs text-slate-500 mt-1.5">Helps show books nearby. Your exact coordinates are never shown to others.</p>
          </div>

          {/* Email Digest */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailDigest}
                onChange={e => setEmailDigest(e.target.checked)}
                className="w-4 h-4 accent-teal-500 rounded"
              />
              <div>
                <p className="text-sm font-medium text-slate-300">Weekly digest email</p>
                <p className="text-xs text-slate-500">Get notified about new books near you every week</p>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>

          {message && (
            <p className={`text-sm text-center ${message.includes('successfully') ? 'text-teal-400' : 'text-red-400'}`}>
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
