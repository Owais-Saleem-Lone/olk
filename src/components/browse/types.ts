export type Profile = {
  id: string
  display_name: string | null
  area_name: string | null
}

export type Book = {
  id: string
  title: string
  author: string | null
  condition: string | null
  listing_type: string
  status: string
  genre: string | null
  owner_id: string
  cover_url: string | null
  description: string | null
  publication_year: number | null
  distance_km?: number | null
  owner_name?: string | null
  owner_area?: string | null
  read_count?: number
}
