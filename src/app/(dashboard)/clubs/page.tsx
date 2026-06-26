"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistance } from '@/lib/geo'
import Link from 'next/link'

type Club = {
  id: string
  name: string
  description: string | null
  interest: string | null
  area_name: string | null
  cover_url: string | null
  creator_id: string
  member_count: number
  created_at: string
  distance_km?: number | null
  creator_name?: string | null
}

const INTERESTS = [
  'Art & Painting', 'Biography', 'Business & Finance', 'Cinema',
  'English Literature', 'Fiction', 'General', 'Hindi Literature',
  'History', 'Philosophy', 'Poetry', 'Psychology',
  'Science', 'Self-Help', 'Technology', 'Travel',
  'Urdu Literature', 'Writing',
]

export default function ClubsPage() {
  const supabase = createClient()
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterInterest, setFilterInterest] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [joinedClubs, setJoinedClubs] = useState<Set<string>>(new Set())
  const [joiningClub, setJoiningClub] = useState<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => { fetchClubs() }, [])

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    fetchClubs()
  }, [filterInterest])

  const fetchClubs = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    let userLat: number | null = null
    let userLng: number | null = null

    if (user) {
      setCurrentUserId(user.id)

      const { data: memberships } = await supabase
        .from('club_members')
        .select('club_id')
        .eq('user_id', user.id)
      if (memberships) {
        setJoinedClubs(new Set(memberships.map(m => m.club_id)))
      }

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', user.id)
        .single()

      if (myProfile?.latitude && myProfile?.longitude) {
        userLat = myProfile.latitude
        userLng = myProfile.longitude
      }
    }

    if (userLat && userLng) {
      const { data } = await supabase.rpc('get_clubs_nearby', {
        user_lat: userLat,
        user_lng: userLng,
      })
      if (data) {
        let filtered = data as Club[]
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          filtered = filtered.filter(c =>
            c.name.toLowerCase().includes(q) || (c.interest && c.interest.toLowerCase().includes(q))
          )
        }
        if (filterInterest) filtered = filtered.filter(c => c.interest === filterInterest)
        setClubs(filtered)
      }
    } else {
      let query = supabase
        .from('clubs')
        .select('*')
        .eq('active', true)
        .order('member_count', { ascending: false })

      if (filterInterest) query = query.eq('interest', filterInterest)

      const { data } = await query
      if (data) {
        let filtered = data as Club[]
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          filtered = filtered.filter(c =>
            c.name.toLowerCase().includes(q) || (c.interest && c.interest.toLowerCase().includes(q))
          )
        }
        setClubs(filtered)
      }
    }

    setLoading(false)
  }

  const handleJoin = async (clubId: string) => {
    if (joiningClub) return
    setJoiningClub(clubId)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setJoiningClub(null); return }

    const { error } = await supabase.from('club_members').insert({ club_id: clubId, user_id: user.id })
    if (error && error.code === '23505') { setJoiningClub(null); return }

    if (!error) {
      setJoinedClubs(prev => new Set(prev).add(clubId))
      setClubs(prev => prev.map(c => c.id === clubId ? { ...c, member_count: c.member_count + 1 } : c))
    }
    setJoiningClub(null)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchClubs()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">Clubs</h1>
        {currentUserId && (
          <Link
            href="/clubs/create"
            className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Create Club
          </Link>
        )}
      </div>
      <p className="text-slate-400 mb-8">Find interest groups and reading clubs near you</p>

      {/* Search & Filter */}
      <form onSubmit={handleSearch} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search clubs..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
          />
          <select
            value={filterInterest}
            onChange={e => setFilterInterest(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="" className="bg-slate-900">All Interests</option>
            {INTERESTS.map(i => <option key={i} value={i} className="bg-slate-900">{i}</option>)}
          </select>
          <button type="submit" className="bg-teal-500 hover:bg-teal-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm">
            Search
          </button>
        </div>
      </form>

      {loading && <p className="text-slate-400 text-center py-20">Loading clubs...</p>}

      {!loading && clubs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">🏘️</div>
          <h2 className="text-xl font-semibold mb-2">No clubs found</h2>
          <p className="text-slate-400 max-w-md">
            {searchQuery || filterInterest
              ? 'No clubs match your search. Try different filters!'
              : 'Be the first to start a local club in your area.'}
          </p>
        </div>
      )}

      {!loading && clubs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clubs.map(club => (
            <div key={club.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-teal-500/30 transition-colors flex flex-col">
              {/* Cover */}
              <div className="w-full h-32 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden relative">
                {club.cover_url ? (
                  <img src={club.cover_url} alt={club.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">🏘️</div>
                )}
                {club.interest && (
                  <div className="absolute top-2 left-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {club.interest}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 flex flex-col flex-1">
                <Link href={`/clubs/${club.id}`} className="text-base font-semibold text-white hover:text-teal-400 transition-colors mb-1">
                  {club.name}
                </Link>
                {club.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">{club.description}</p>
                )}

                <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    <span className="text-slate-300 font-medium">{club.member_count}</span> {club.member_count === 1 ? 'member' : 'members'}
                    {club.distance_km != null && (
                      <span className="ml-2 text-teal-400 font-medium">{formatDistance(club.distance_km)}</span>
                    )}
                    {club.area_name && <span className="ml-1">· 📍 {club.area_name}</span>}
                  </div>
                </div>

                <div className="mt-3">
                  {!currentUserId ? (
                    <Link href="/login" className="w-full block text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                      Login to Join
                    </Link>
                  ) : joinedClubs.has(club.id) ? (
                    <Link href={`/clubs/${club.id}`} className="w-full block text-center bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium py-2 rounded-lg text-sm">
                      Member ✓
                    </Link>
                  ) : (
                    <button onClick={() => handleJoin(club.id)} disabled={joiningClub === club.id}
                      className="w-full bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                      {joiningClub === club.id ? 'Joining...' : 'Join Club'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
