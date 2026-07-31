import { describe, it, expect } from 'vitest'
import { serviceClient } from './helpers'

// Regression test for a fixed bug (found while building this suite,
// tracked in known-issues.test.ts until the fix landed): handle_new_user()
// defaulted profiles.display_name to the raw signup email, but display_name
// is varchar(50). A longer email made that INSERT raise "value too long for
// type character varying(50)", which rolled back the whole auth.users insert
// inside the same transaction -- a hard signup failure, not a cosmetic
// display-name issue. Fixed by truncating the default to the column's limit
// (migration 20260731160026_truncate_default_display_name_to_column_limit).
describe('signup succeeds regardless of email length', () => {
  it('creates an account and a truncated display_name for a 50+ character email', async () => {
    const longEmail = 'a.very.long.but.entirely.valid.email.address@example.com'
    expect(longEmail.length).toBeGreaterThan(50)

    const { data, error } = await serviceClient.auth.admin.createUser({
      email: longEmail,
      password: 'Test-1234!',
      email_confirm: true,
    })
    expect(error).toBeNull()

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('display_name')
      .eq('id', data!.user!.id)
      .single()
    expect(profile?.display_name).toBe(longEmail.slice(0, 50))

    await serviceClient.auth.admin.deleteUser(data!.user!.id)
  })
})
