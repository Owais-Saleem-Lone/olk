export function formatDistance(km: number | null): string | null {
  if (km === null || km === undefined) return null
  if (km < 1) return '< 1 km'
  if (km < 10) return `~${Math.round(km)} km`
  return `~${Math.round(km / 5) * 5} km`
}

// Client-side haversine for single-record detail pages that fetch a book
// directly by id, rather than through the get_books_nearby RPC (which computes
// distance_km in SQL for the whole nearby list at once).
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
