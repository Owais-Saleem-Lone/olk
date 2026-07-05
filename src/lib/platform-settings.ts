export type FeatureFlags = {
  feature_clubs: boolean
  feature_wishlists: boolean
  feature_ratings: boolean
  feature_messages: boolean
  maintenance_mode: boolean
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  feature_clubs: true,
  feature_wishlists: true,
  feature_ratings: true,
  feature_messages: true,
  maintenance_mode: false,
}

export const FEATURE_FLAG_KEYS = Object.keys(DEFAULT_FEATURE_FLAGS) as (keyof FeatureFlags)[]

// platform_settings.value is jsonb; it may hold a real JSON boolean (as
// seeded by migrations) or the JSON string "true"/"false" (as written by
// admin-actions.ts's updatePlatformSetting), so accept both.
export function parseFeatureFlags(rows: { key: string; value: unknown }[] | null): FeatureFlags {
  const flags = { ...DEFAULT_FEATURE_FLAGS }
  for (const row of rows || []) {
    if ((FEATURE_FLAG_KEYS as string[]).includes(row.key)) {
      (flags as Record<string, boolean>)[row.key] = row.value === true || row.value === 'true'
    }
  }
  return flags
}
