import { defineConfig } from 'vitest/config'
import path from 'path'

// Separate from vitest.config.ts on purpose: these tests hit a real local
// Supabase stack (RLS policies, triggers, roles) and must not run as part of
// the fast, dependency-free `npm test` unit suite. Run `supabase start` (and
// `supabase db reset` to guarantee a clean slate) before `npm run test:rls`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
