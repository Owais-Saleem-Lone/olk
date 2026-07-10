"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { createNotification } from '@/lib/notifications'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import ConfirmModal from '@/components/confirm-modal'

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
}

type Post = {
  id: string
  content: string
  created_at: string
  author_id: string
  profiles: { display_name: string | null }
}

type Member = {
  user_id: string
  joined_at: string
  profiles: { display_name: string | null; area_name: string | null }
}

export default function ClubDetailPage() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const clubId = params.id as string

  const [club, setClub] = useState<Club | null>(null)
  const [creatorName, setCreatorName] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [isMember, setIsMember] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [newPost, setNewPost] = useState('')
  const [posting, setPosting] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const fetchClub = useCallback(async () => {
    setLoading(true)

    const { data: clubData } = await supabase
      .from('clubs')
      .select('*')
      .eq('id', clubId)
      .single()

    if (!clubData) { setNotFound(true); setLoading(false); return }
    setClub(clubData)
    setEditName(clubData.name)
    setEditDesc(clubData.description || '')

    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', clubData.creator_id)
      .single()
    setCreatorName(creatorProfile?.display_name || 'Anonymous')

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      setIsCreator(user.id === clubData.creator_id)

      const { data: membership } = await supabase
        .from('club_members')
        .select('id')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle()
      setIsMember(!!membership)
    }

    const { data: postsData } = await supabase
      .from('club_posts')
      .select('id, content, created_at, author_id, profiles(display_name)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (postsData) setPosts(postsData as unknown as Post[])

    const { data: membersData } = await supabase
      .from('club_members')
      .select('user_id, joined_at, profiles(display_name, area_name)')
      .eq('club_id', clubId)
      .order('joined_at', { ascending: true })
    if (membersData) setMembers(membersData as unknown as Member[])

    setLoading(false)
  }, [supabase, clubId])

  useAsyncEffect(() => fetchClub(), [fetchClub])

  const handleJoin = async () => {
    if (!currentUserId || !club) return
    const { error } = await supabase.from('club_members').insert({ club_id: clubId, user_id: currentUserId })
    if (error) return

    setIsMember(true)
    setClub(prev => prev ? { ...prev, member_count: prev.member_count + 1 } : prev)

    await createNotification({
      userId: club.creator_id,
      type: 'club_joined',
      title: `Someone joined your club "${club.name}"`,
      link: `/clubs/${clubId}`,
      context: { kind: 'club_join', id: clubId },
    })

    fetchClub()
  }

  const handleLeave = async () => {
    if (!currentUserId || !club) return
    await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', currentUserId)
    setIsMember(false)
    setClub(prev => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev)
    fetchClub()
  }

  const handlePost = async () => {
    if (!newPost.trim() || !currentUserId || posting) return
    setPosting(true)

    const { error } = await supabase.from('club_posts').insert({
      club_id: clubId,
      author_id: currentUserId,
      content: newPost.trim(),
    })

    if (!error) {
      setNewPost('')

      const memberIds = members.map(m => m.user_id).filter(id => id !== currentUserId)
      for (const id of memberIds) {
        await createNotification({
          userId: id,
          type: 'club_announcement',
          title: `New announcement in "${club?.name}"`,
          link: `/clubs/${clubId}`,
          context: { kind: 'club_announcement', id: clubId },
        })
      }

      fetchClub()
    }
    setPosting(false)
  }

  const handleSaveEdit = async () => {
    if (!editName.trim()) return
    await supabase.from('clubs').update({ name: editName.trim(), description: editDesc.trim() || null }).eq('id', clubId)
    setClub(prev => prev ? { ...prev, name: editName.trim(), description: editDesc.trim() || null } : prev)
    setEditing(false)
  }

  const handleDelete = async () => {
    setConfirmingDelete(false)
    await supabase.from('clubs').update({ active: false }).eq('id', clubId)
    router.push('/clubs')
  }

  const handleDeletePost = async (postId: string) => {
    await supabase.from('club_posts').delete().eq('id', postId)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  if (loading) return <p className="text-slate-400 text-center py-20">Loading club...</p>

  if (notFound) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🏘️</div>
        <h2 className="text-xl font-semibold mb-2">Club not found</h2>
        <Link href="/clubs" className="text-brand-teal-light hover:text-teal-300 text-sm">← Back to Clubs</Link>
      </div>
    )
  }

  const joinDate = club ? new Date(club.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''

  return (
    <div>
      {/* Header */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden mb-8">
        {club?.cover_url && (
          <div className="relative w-full h-40 overflow-hidden">
            <Image src={club.cover_url} alt={club.name} fill unoptimized sizes="100vw" className="object-cover" referrerPolicy="no-referrer" />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {editing ? (
                <div className="space-y-3 mb-4">
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} className="bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors">Save</button>
                    <button onClick={() => setEditing(false)} className="text-sm text-slate-400 hover:text-white px-3 py-1.5">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold mb-1">{club?.name}</h1>
                  {club?.description && <p className="text-slate-400 text-sm mb-3">{club.description}</p>}
                </>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                {club?.interest && (
                  <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-medium px-2.5 py-1 rounded-full">{club.interest}</span>
                )}
                {club?.area_name && <span>📍 {club.area_name}</span>}
                <span>Founded {joinDate}</span>
                <span>by <Link href={`/user/${club?.creator_id}`} className="text-brand-teal-light hover:text-teal-300">{creatorName}</Link></span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              {!currentUserId ? (
                <Link href="/login" className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors text-center">
                  Login to Join
                </Link>
              ) : isCreator ? (
                <>
                  {!editing && (
                    <button onClick={() => setEditing(true)} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors">Edit</button>
                  )}
                  <button onClick={() => setConfirmingDelete(true)} className="text-xs text-red-400/70 hover:text-red-400 transition-colors px-4 py-1.5">Delete Club</button>
                </>
              ) : isMember ? (
                <button onClick={handleLeave} className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
                  Leave Club
                </button>
              ) : (
                <button onClick={handleJoin} className="bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors">
                  Join Club
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/[0.06]">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{club?.member_count || 0}</p>
              <p className="text-xs text-slate-500 mt-1">Members</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-brand-teal-light">{posts.length}</p>
              <p className="text-xs text-slate-500 mt-1">Announcements</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-cyan-400">{joinDate}</p>
              <p className="text-xs text-slate-500 mt-1">Founded</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Announcements (left/main) */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Announcements</h2>

          {isCreator && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
              <textarea
                value={newPost}
                onChange={e => setNewPost(e.target.value)}
                placeholder="Write an announcement for your club..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none mb-3"
              />
              <button
                onClick={handlePost}
                disabled={!newPost.trim() || posting}
                className="bg-brand-teal hover:bg-brand-teal-light disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {posting ? 'Posting...' : 'Post Announcement'}
              </button>
            </div>
          )}

          {posts.length === 0 ? (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-8 text-center text-slate-500">
              No announcements yet.
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                    <p className="text-xs text-slate-500">
                      {post.profiles?.display_name || 'Admin'} · {new Date(post.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {isCreator && (
                      <button onClick={() => handleDeletePost(post.id)} className="text-xs text-slate-600 hover:text-red-400 transition-colors">Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Members (right sidebar) */}
        <div>
          <button onClick={() => setShowMembers(!showMembers)} className="flex items-center justify-between w-full text-xl font-semibold mb-4">
            <span>Members ({club?.member_count || 0})</span>
            <span className="text-slate-500 text-sm">{showMembers ? '▲' : '▼'}</span>
          </button>

          {showMembers && (
            <div className="space-y-2">
              {members.map(m => (
                <Link
                  key={m.user_id}
                  href={`/user/${m.user_id}`}
                  className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 hover:border-brand-teal/20 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-brand-teal-light font-bold text-sm flex-shrink-0">
                    {(m.profiles?.display_name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{m.profiles?.display_name || 'Anonymous'}</p>
                    {m.profiles?.area_name && (
                      <p className="text-xs text-slate-500">{m.profiles.area_name}</p>
                    )}
                  </div>
                  {m.user_id === club?.creator_id && (
                    <span className="ml-auto text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Admin</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <Link href="/clubs" className="text-sm text-slate-400 hover:text-brand-teal-light transition-colors">← Back to Clubs</Link>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete this club?"
          message="This cannot be undone."
          confirmLabel="Delete Club"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
