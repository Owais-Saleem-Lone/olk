import { describe, it, expect } from 'vitest'
import { parseFeatureFlags, DEFAULT_FEATURE_FLAGS } from './platform-settings'

describe('parseFeatureFlags', () => {
  it('returns the defaults when rows is null', () => {
    expect(parseFeatureFlags(null)).toEqual(DEFAULT_FEATURE_FLAGS)
  })

  it('returns the defaults when rows is empty', () => {
    expect(parseFeatureFlags([])).toEqual(DEFAULT_FEATURE_FLAGS)
  })

  it('accepts a real JSON boolean value', () => {
    const flags = parseFeatureFlags([{ key: 'maintenance_mode', value: true }])
    expect(flags.maintenance_mode).toBe(true)
  })

  it('accepts the JSON string "true"/"false" written by admin-actions.ts', () => {
    const flags = parseFeatureFlags([
      { key: 'feature_clubs', value: 'false' },
      { key: 'maintenance_mode', value: 'true' },
    ])
    expect(flags.feature_clubs).toBe(false)
    expect(flags.maintenance_mode).toBe(true)
  })

  it('treats any other value as false, not just falsy ones', () => {
    const flags = parseFeatureFlags([{ key: 'feature_events', value: 'yes' }])
    expect(flags.feature_events).toBe(false)
  })

  it('ignores rows with unrecognized keys', () => {
    const flags = parseFeatureFlags([{ key: 'not_a_real_flag', value: true }])
    expect(flags).toEqual(DEFAULT_FEATURE_FLAGS)
  })

  it('leaves flags absent from rows at their default', () => {
    const flags = parseFeatureFlags([{ key: 'maintenance_mode', value: true }])
    expect(flags.feature_clubs).toBe(DEFAULT_FEATURE_FLAGS.feature_clubs)
    expect(flags.feature_wishlists).toBe(DEFAULT_FEATURE_FLAGS.feature_wishlists)
  })
})
