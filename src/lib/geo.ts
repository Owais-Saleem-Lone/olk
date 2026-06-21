export function formatDistance(km: number | null): string | null {
  if (km === null || km === undefined) return null
  if (km < 1) return '< 1 km'
  if (km < 10) return `~${Math.round(km)} km`
  return `~${Math.round(km / 5) * 5} km`
}
