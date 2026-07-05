"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAG_KEYS, parseFeatureFlags, type FeatureFlags } from '@/lib/platform-settings'

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', FEATURE_FLAG_KEYS)
      .then(({ data }) => setFlags(parseFeatureFlags(data)))
  }, [])

  return flags
}
