// FIXED: Removed the [] from books and profiles.
// Since a request belongs to ONE book and ONE user, Supabase returns them as single objects, not arrays.
export type BookRequest = {
  id: string
  status: string
  created_at: string
  handed_over_at: string | null
  requester_id: string
  book_id: string
  books: { title: string; owner_id: string; listing_type: string; lending_duration_months: number | null; cover_url: string | null }
  profiles: { display_name: string | null; area_name: string | null }
}
