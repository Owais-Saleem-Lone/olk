"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import SearchFilters from '@/components/browse/search-filters'
import BookCard from '@/components/browse/book-card'
import type { Book, Profile } from '@/components/browse/types'

function sanitizeSearchQuery(input: string): string {
  return input.replace(/[%_\\,().]/g, c => '\\' + c)
}

export default function BrowsePage() {
  const supabase = createClient()
  const [books, setBooks] = useState<Book[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q') || '' : ''
  )
  const [filterGenre, setFilterGenre] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCondition, setFilterCondition] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [hasLocation, setHasLocation] = useState(false)
  const [bookProgress, setBookProgress] = useState<Record<string, number>>({})

  const mounted = useRef(false)

  const fetchBooks = async (query: string = '') => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    let userLat: number | null = null
    let userLng: number | null = null

    if (user) {
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
      setHasLocation(true)
      const { data, error } = await supabase.rpc('get_books_nearby', {
        user_lat: userLat,
        user_lng: userLng,
      })

      if (error) {
        console.error('Error fetching nearby books:', error)
      } else if (data) {
        let filtered = data as Book[]
        if (query.trim() !== '') {
          const q = query.toLowerCase()
          filtered = filtered.filter(b =>
            b.title.toLowerCase().includes(q) || (b.author && b.author.toLowerCase().includes(q))
          )
        }
        if (filterGenre) filtered = filtered.filter(b => b.genre === filterGenre)
        if (filterType) filtered = filtered.filter(b => b.listing_type === filterType)
        if (filterCondition) filtered = filtered.filter(b => b.condition === filterCondition)
        setBooks(filtered)
        fetchProgress(filtered)
        const profileMap: Record<string, Profile> = {}
        filtered.forEach((b) => {
          if (!profileMap[b.owner_id]) {
            profileMap[b.owner_id] = { id: b.owner_id, display_name: b.owner_name ?? null, area_name: b.owner_area ?? null }
          }
        })
        setProfiles(profileMap)
      }
    } else {
      const hasActiveFilter = query.trim() !== '' || !!filterGenre || !!filterType || !!filterCondition
      let data: Book[] | null = null
      let error: { message: string } | null = null

      if (!hasActiveFilter) {
        // No search/filters: this is the exact same public list for every
        // visitor, so it's served from a short-lived server cache
        // (/api/books) instead of hitting Supabase directly on every load.
        try {
          const res = await fetch('/api/books')
          if (!res.ok) throw new Error(`Failed to load books (${res.status})`)
          data = await res.json()
        } catch (e) {
          error = { message: (e as Error).message }
        }
      } else {
        // A search/filter is active: bounded to avoid pulling the entire
        // table, but not cacheable since results vary per query/filter combo.
        let dbQuery = supabase
          .from('books')
          .select('*')
          .in('status', ['available', 'given', 'unavailable'])
          .order('created_at', { ascending: false })
          .limit(200)

        if (query.trim() !== '') {
          const q = sanitizeSearchQuery(query)
          dbQuery = dbQuery.or(`title.ilike.%${q}%,author.ilike.%${q}%`)
        }
        if (filterGenre) dbQuery = dbQuery.eq('genre', filterGenre)
        if (filterType) dbQuery = dbQuery.eq('listing_type', filterType)
        if (filterCondition) dbQuery = dbQuery.eq('condition', filterCondition)

        const result = await dbQuery
        data = result.data
        error = result.error
      }

      if (error) {
        console.error('Error fetching books:', error)
      } else if (data) {
        setBooks(data)
        if (user) {
          await fetchProfiles(data)
          fetchProgress(data)
        }
      }
    }

    setLoading(false)
  }

  const fetchProgress = async (booksData: Book[]) => {
    if (!booksData.length) return
    const bookIds = booksData.map(b => b.id)
    const { data } = await supabase
      .from('book_progress')
      .select('book_id, progress_pct')
      .in('book_id', bookIds)
    if (data) {
      const pm: Record<string, number> = {}
      data.forEach((p: { book_id: string; progress_pct: number }) => { pm[p.book_id] = p.progress_pct })
      setBookProgress(pm)
    }
  }

  const fetchProfiles = async (booksData: Book[]) => {
    // Get unique owner IDs
    const ownerIds = [...new Set(booksData.map(b => b.owner_id))]
    if (ownerIds.length === 0) return

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ownerIds)

    if (data) {
      const profileMap: Record<string, Profile> = {}
      data.forEach((p) => {
        profileMap[p.id] = p
      })
      setProfiles(profileMap)
    }
  }

  // Intentionally run once on mount with the initial searchQuery; typing updates
  // searchQuery on every keystroke and search is otherwise triggered explicitly via handleSearch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useAsyncEffect(() => fetchBooks(searchQuery), [])

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    queueMicrotask(() => fetchBooks(searchQuery))
    // searchQuery is deliberately excluded here too — only filter changes should auto-refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterGenre, filterType, filterCondition])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchBooks(searchQuery)
  }

  let displayBooks = filterArea
    ? books.filter(b => {
        const area = profiles[b.owner_id]?.area_name
        return area && area.toLowerCase().includes(filterArea.toLowerCase())
      })
    : books

  if (radiusKm != null) {
    displayBooks = displayBooks.filter(b => b.distance_km != null && b.distance_km <= radiusKm)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Browse Books</h1>
      <p className="text-slate-600 mb-8">Find your next read from someone nearby</p>

      <SearchFilters
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearch={handleSearch}
        onClearSearch={() => { setSearchQuery(''); fetchBooks('') }}
        filterGenre={filterGenre}
        onFilterGenreChange={setFilterGenre}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        filterCondition={filterCondition}
        onFilterConditionChange={setFilterCondition}
        filterArea={filterArea}
        onFilterAreaChange={setFilterArea}
        radiusKm={radiusKm}
        onRadiusKmChange={setRadiusKm}
        hasLocation={hasLocation}
      />

      {/* Loading State */}
      {loading && (
        <p className="text-slate-600 text-center py-20">Loading books...</p>
      )}

      {/* Empty State */}
      {!loading && displayBooks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-6xl mb-4">📖</div>
          <h2 className="text-xl font-semibold mb-2">No books found</h2>
          <p className="text-slate-600 max-w-md">
            {(searchQuery || filterGenre || filterType || filterCondition || filterArea)
              ? 'No books match your filters. Try adjusting your search!'
              : 'Be the first to add a book to the community!'}
          </p>
        </div>
      )}

      {/* Books Grid */}
      {!loading && displayBooks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              owner={profiles[book.owner_id]}
              progress={bookProgress[book.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
