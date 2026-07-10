export type Book = {
  id: string
  title: string
  author: string | null
  condition: string | null
  listing_type: string
  status: string
  genre: string | null
  cover_url: string | null
  lending_duration_months: 1 | 2 | 3 | null
  acquired_via_donation: boolean
  read_count: number
}

export type ReceivedBook = {
  id: string
  handed_over_at: string | null
  book_id: string
  books: {
    id: string
    title: string
    author: string | null
    cover_url: string | null
    genre: string | null
    listing_type: string
    lending_duration_months: number | null
  }
}
