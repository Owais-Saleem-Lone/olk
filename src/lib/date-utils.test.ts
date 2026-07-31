import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { dueDaysLeft } from './date-utils'

describe('dueDaysLeft', () => {
  let originalTz: string | undefined

  beforeAll(() => {
    originalTz = process.env.TZ
    // dueDaysLeft mixes a UTC-parsed date with local-time Date methods
    // (setMonth/getMonth) -- pin TZ so day counts are deterministic
    // regardless of which timezone the test runner happens to be in.
    process.env.TZ = 'UTC'
  })

  afterAll(() => {
    process.env.TZ = originalTz
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when handedOverAt is missing', () => {
    expect(dueDaysLeft(null, 3)).toBeNull()
  })

  it('returns null when months is null or zero', () => {
    expect(dueDaysLeft('2026-01-01T00:00:00Z', null)).toBeNull()
    expect(dueDaysLeft('2026-01-01T00:00:00Z', 0)).toBeNull()
  })

  it('counts the days remaining until the due date', () => {
    // handed over 2026-01-01, 1-month loan -> due 2026-02-01; "now" is 2026-01-15
    expect(dueDaysLeft('2026-01-01T00:00:00Z', 1)).toBe(17)
  })

  it('returns a negative count once the due date has passed', () => {
    // handed over 2025-11-01, 2-month loan -> due 2026-01-01; "now" is 2026-01-15
    expect(dueDaysLeft('2025-11-01T00:00:00Z', 2)).toBe(-14)
  })
})
