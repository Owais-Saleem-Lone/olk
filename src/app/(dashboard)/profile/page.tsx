"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const supabase = createClient()
  const [displayName, setDisplayName] = useState('')
  const [areaName, setAreaName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data) {
        setDisplayName(data.display_name || '')
        setAreaName(data.area_name || '')
      }
    }
    setLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // "upsert" means: update if it exists, insert if it doesn't
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      display_name: displayName,
      area_name: areaName,
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