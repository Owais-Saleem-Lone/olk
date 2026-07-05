import { describe, it, expect } from 'vitest'
import { formatDistance } from './geo'

describe('formatDistance', () => {
  it('returns null for null/undefined input', () => {
    expect(formatDistance(null)).toBeNull()
    expect(formatDistance(undefined as unknown as null)).toBeNull()
  })

  it('shows "< 1 km" under a kilometre', () => {
    expect(formatDistance(0.4)).toBe('< 1 km')
  })

  it('rounds to the nearest km under 10', () => {
    expect(formatDistance(4.6)).toBe('~5 km')
  })

  it('rounds to the nearest 5 km at 10 or above', () => {
    expect(formatDistance(12)).toBe('~10 km')
    expect(formatDistance(13)).toBe('~15 km')
  })
})
