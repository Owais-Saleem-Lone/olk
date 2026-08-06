"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { createNotification, notifyClubChatMessage } from '@/lib/notifications'
import { toast } from '@/hooks/use-toast'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import ConfirmModal from '@/components/confirm-modal'

type Club = {
  id: string
  name: string
  description: string | null
  interests: string[]
  area_name: string | null
  cover_url: string | null
  creator_id: string
  member_count: number
  created_at: string
  rating_avg: number | null
  rating_count: number
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

type ClubEvent = {
  id: string
  title: string
  starts_at: string
  is_online: boolean
  location_name: string | null
  visibility: string
  attendee_count: number
}

export default function ClubDetailPage() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const clubId = params.id as string

  const [club, setClub] = useState<Club | null>(null)
  const [creatorName, setCreatorName] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [postCount, setPostCount] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [pendingApplicants, setPendingApplicants] = useState<Member[]>([])
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [membershipStatus, setMembershipStatus] = useState<'none' | 'pending' | 'approved'>('none')
  const [isCreator, setIsCreator] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [joining, setJoining] = useState(false)

  const [newPost, setNewPost] = useState('')
  const [posting, setPosting] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [myRating, setMyRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitting, setRatingSubmitting] = useState(false)

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
        .select('status')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle()
      setMembershipStatus(membership ? (membership.status as 'pending' | 'approved') : 'none')

      const { data: myRatingRow } = await supabase
        .from('club_ratings')
        .select('score, comment')
        .eq('club_id', clubId)
        .eq('rater_id', user.id)
        .maybeSingle()
      if (myRatingRow) {
        setMyRating(myRatingRow.score)
        setRatingComment(myRatingRow.comment || '')
      }
    }

    const { data: postsData, count: postsCount } = await supabase
      .from('club_posts')
      .select('id, content, created_at, author_id, profiles(display_name)', { count: 'exact' })
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (postsData) setPosts(postsData as unknown as Post[])
    setPostCount(postsCount ?? 0)

    const { data: eventsData } = await supabase
      .from('club_events')
      .select('id, title, starts_at, is_online, location_name, visibility, attendee_count')
      .eq('club_id', clubId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(10)
    if (eventsData) setEvents(eventsData as ClubEvent[])

    const { data: membersData } = await supabase
      .from('club_members')
      .select('user_id, joined_at, profiles(display_name, area_name)')
      .eq('club_id', clubId)
      .eq('status', 'approved')
      .order('joined_at', { ascending: true })
    if (membersData) setMembers(membersData as unknown as Member[])

    // Only ever non-empty for the creator -- RLS hides pending rows from
    // everyone else, this just avoids running the applicant-review UI logic
    // for members who'd get an empty list back anyway.
    const { data: applicantsData } = await supabase
      .from('club_members')
      .select('user_id, joined_at, profiles(display_name, area_name)')
      .eq('club_id', clubId)
      .eq('status', 'pending')
      .order('joined_at', { ascending: true })
    if (applicantsData) setPendingApplicants(applicantsData as unknown as Member[])

    setLoading(false)
  }, [supabase, clubId])

  useAsyncEffect(() => fetchClub(), [fetchClub])

  const isMember = membershipStatus === 'approved'

  const handleRequestToJoin = async () => {
    if (!currentUserId || !club || joining) return
    setJoining(true)

    const { error } = await supabase.from('club_members').insert({ club_id: clubId, user_id: currentUserId })
    if (error) {
      toast.error('Could not send request: ' + error.message)
      setJoining(false)
      return
    }

    setMembershipStatus('pending')

    await createNotification({
      userId: club.creator_id,
      type: 'club_joined',
      title: `Someone wants to join your club "${club.name}"`,
      link: `/clubs/${clubId}`,
      context: { kind: 'club_join', id: clubId },
    })

    setJoining(false)
    fetchClub()
  }

  const handleLeave = async () => {
    if (!currentUserId || !club) return
    const wasApproved = membershipStatus === 'approved'
    await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', currentUserId)
    setMembershipStatus('none')
    if (wasApproved) {
      setClub(prev => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev)
    }
    fetchClub()
  }

  const handleApproveMember = async (userId: string) => {
    const { error } = await supabase.from('club_members').update({ status: 'approved' }).eq('club_id', clubId).eq('user_id', userId)
    if (error) { toast.error('Could not approve: ' + error.message); return }

    await createNotification({
      userId,
      type: 'club_membership_approved',
      title: `You're in! Your request to join "${club?.name}" was approved`,
      link: `/clubs/${clubId}`,
      context: { kind: 'club_membership_approved', id: clubId },
    })

    fetchClub()
  }

  const handleRejectMember = async (userId: string) => {
    const { error } = await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId)
    if (error) { toast.error('Could not reject: ' + error.message); return }
    fetchClub()
  }

  const handlePost = async () => {
    if (!newPost.trim() || !currentUserId || posting) return
    setPosting(true)

    const { data: post, error } = await supabase.from('club_posts').insert({
      club_id: clubId,
      author_id: currentUserId,
      content: newPost.trim(),
    }).select().single()

    if (error) {
      toast.error(
        error.message.startsWith('RATE_LIMIT_EXCEEDED:')
          ? "You've hit the hourly message limit for this club. Please wait before sending more."
          : 'Could not send message: ' + error.message
      )
      setPosting(false)
      return
    }

    setNewPost('')
    try {
      await notifyClubChatMessage(post.id)
    } catch (err) {
      console.error('Failed to notify club members:', err)
    }
    fetchClub()
    setPosting(false)
  }

  const handleRate = async (score: number) => {
    if (!currentUserId || !isMember || ratingSubmitting) return
    setRatingSubmitting(true)

    const { error } = await supabase.from('club_ratings').upsert(
      { club_id: clubId, rater_id: currentUserId, score, comment: ratingComment.trim() || null },
      { onConflict: 'club_id,rater_id' }
    )

    if (error) {
      toast.error('Could not save your rating: ' + error.message)
    } else {
      setMyRating(score)
      fetchClub()
    }
    setRatingSubmitting(false)
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

  if (loading) return <p className="text-slate-600 text-center py-20">Loading club...</p>

  if (notFound) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🏘️</div>
        <h2 className="text-xl font-semibold mb-2">Club not found</h2>
        <Link href="/clubs" className="text-brand-teal-dark hover:text-teal-700 text-sm">← Back to Clubs</Link>
      </div>
    )
  }

  const joinDate = club ? new Date(club.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''

  return (
    <div>
      {/* Header */}
      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden mb-8">
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
                    className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                    className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} className="bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors">Save</button>
                    <button onClick={() => setEditing(false)} className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold mb-1">{club?.name}</h1>
                  {club?.description && <p className="text-slate-600 text-sm mb-3">{club.description}</p>}
                </>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                {club?.interests?.map(i => (
                  <span key={i} className="bg-purple-500/10 text-purple-600 border border-purple-500/20 text-xs font-medium px-2.5 py-1 rounded-full">{i}</span>
                ))}
                {club?.area_name && <span>📍 {club.area_name}</span>}
                <span>Founded {joinDate}</span>
                <span>by <Link href={`/user/${club?.creator_id}`} className="text-brand-teal-dark hover:text-teal-700">{creatorName}</Link></span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              {!currentUserId ? (
                <Link href="/login" className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 font-medium px-5 py-2 rounded-lg text-sm transition-colors text-center">
                  Login to Join
                </Link>
              ) : isCreator ? (
                <>
                  {!editing && (
                    <button onClick={() => setEditing(true)} className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 font-medium px-4 py-2 rounded-lg text-xs transition-colors">Edit</button>
                  )}
                  <button onClick={() => setConfirmingDelete(true)} className="text-xs text-red-600/70 hover:text-red-600 transition-colors px-4 py-1.5">Delete Club</button>
                </>
              ) : membershipStatus === 'approved' ? (
                <button onClick={handleLeave} className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 font-medium px-5 py-2 rounded-lg text-sm transition-colors">
                  Leave Club
                </button>
              ) : membershipStatus === 'pending' ? (
                <button onClick={handleLeave} className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-700 font-medium px-5 py-2 rounded-lg text-sm transition-colors" title="Cancel your request">
                  Request Pending
                </button>
              ) : (
                <button onClick={handleRequestToJoin} disabled={joining} className="bg-brand-teal hover:bg-brand-teal-light disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors">
                  {joining ? 'Requesting...' : 'Request to Join'}
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-black/5">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{club?.member_count || 0}</p>
              <p className="text-xs text-slate-500 mt-1">Members</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-brand-teal-dark">{postCount}</p>
              <p className="text-xs text-slate-500 mt-1">Chat messages</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-500">
                {club?.rating_avg ? `${club.rating_avg.toFixed(1)}★` : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {club?.rating_count ? `${club.rating_count} rating${club.rating_count === 1 ? '' : 's'}` : 'No ratings yet'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-cyan-400">{joinDate}</p>
              <p className="text-xs text-slate-500 mt-1">Founded</p>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="bg-white border border-black/5 rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Upcoming Events</h2>
          {isCreator && (
            <Link
              href={`/clubs/${clubId}/events/create`}
              className="flex items-center gap-1.5 bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
            >
              + Create Event
            </Link>
          )}
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No upcoming events yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {events.map(ev => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="bg-white border border-black/5 rounded-xl p-4 hover:border-brand-teal/20 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-sm font-semibold text-slate-900 truncate">{ev.title}</p>
                  {ev.visibility === 'members_only' && (
                    <span className="flex-shrink-0 text-[10px] font-medium text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Members</span>
                  )}
                </div>
                <p className="text-xs text-slate-600">
                  {new Date(ev.starts_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {ev.is_online ? '💻 Online' : ev.location_name ? `📍 ${ev.location_name}` : '📍 TBA'}
                  {' · '}{ev.attendee_count} going
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Club chat (left/main) */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Club Chat</h2>

          {isMember && (
            <div className="bg-white border border-black/5 rounded-xl p-4 mb-4">
              <textarea
                value={newPost}
                onChange={e => setNewPost(e.target.value)}
                placeholder="Send a message to the club..."
                rows={3}
                className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-slate-900 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none mb-3"
              />
              <button
                onClick={handlePost}
                disabled={!newPost.trim() || posting}
                className="bg-brand-teal hover:bg-brand-teal-light disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {posting ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          )}

          {posts.length === 0 ? (
            <div className="bg-white border border-black/5 rounded-xl p-8 text-center text-slate-500">
              No messages yet. {isMember ? 'Be the first to say hello.' : ''}
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="bg-white border border-black/5 rounded-xl p-5">
                  <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5">
                    <p className="text-xs text-slate-500">
                      {post.profiles?.display_name || 'Anonymous'}
                      {post.author_id === club?.creator_id && ' · Owner'}
                      {' · '}{new Date(post.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {(isCreator || post.author_id === currentUserId) && (
                      <button onClick={() => handleDeletePost(post.id)} className="text-xs text-slate-400 hover:text-red-600 transition-colors">Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rating */}
          <div className="bg-white border border-black/5 rounded-xl p-5 mt-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Rate this club</h3>
            {isMember ? (
              <>
                <p className="text-xs text-slate-500 mb-3">Only members can rate a club they belong to.</p>
                <div className="flex items-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => handleRate(n)}
                      disabled={ratingSubmitting}
                      className={`text-2xl leading-none transition-colors ${n <= myRating ? 'text-amber-500' : 'text-slate-300 hover:text-amber-300'}`}
                      aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  onBlur={() => myRating > 0 && handleRate(myRating)}
                  placeholder="Optional comment..."
                  rows={2}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
                />
              </>
            ) : (
              <p className="text-xs text-slate-500">Become a member to rate it.</p>
            )}
          </div>
        </div>

        {/* Members (right sidebar) */}
        <div>
          {isCreator && pendingApplicants.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Membership Requests ({pendingApplicants.length})</h3>
              <div className="space-y-2">
                {pendingApplicants.map(a => (
                  <div key={a.user_id} className="bg-white border border-black/5 rounded-lg p-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-brand-teal-dark font-bold text-sm flex-shrink-0">
                        {(a.profiles?.display_name || '?')[0].toUpperCase()}
                      </div>
                      <Link href={`/user/${a.user_id}`} className="text-sm text-slate-900 font-medium hover:text-brand-teal-dark transition-colors">
                        {a.profiles?.display_name || 'Anonymous'}
                      </Link>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveMember(a.user_id)} className="flex-1 bg-brand-teal hover:bg-brand-teal-light text-white text-xs font-semibold py-1.5 rounded-lg transition-colors">
                        Approve
                      </button>
                      <button onClick={() => handleRejectMember(a.user_id)} className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium py-1.5 rounded-lg transition-colors">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setShowMembers(!showMembers)} className="flex items-center justify-between w-full text-xl font-semibold mb-4">
            <span>Members ({club?.member_count || 0})</span>
            <span className="text-slate-500 text-sm">{showMembers ? '▲' : '▼'}</span>
          </button>

          {showMembers && (
            isMember ? (
              <div className="space-y-2">
                {members.map(m => (
                  <Link
                    key={m.user_id}
                    href={`/user/${m.user_id}`}
                    className="flex items-center gap-3 bg-white border border-black/5 rounded-lg p-3 hover:border-brand-teal/20 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center text-brand-teal-dark font-bold text-sm flex-shrink-0">
                      {(m.profiles?.display_name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-slate-900 font-medium">{m.profiles?.display_name || 'Anonymous'}</p>
                      {m.profiles?.area_name && (
                        <p className="text-xs text-slate-500">{m.profiles.area_name}</p>
                      )}
                    </div>
                    {m.user_id === club?.creator_id && (
                      <span className="ml-auto text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Admin</span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-black/5 rounded-xl p-5 text-sm text-slate-500">
                Join this club to see its members.
              </div>
            )
          )}
        </div>
      </div>

      <div className="mt-8">
        <Link href="/clubs" className="text-sm text-slate-600 hover:text-brand-teal-dark transition-colors">← Back to Clubs</Link>
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
