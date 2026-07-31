import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

// These are the fixed, publicly-documented Supabase CLI local-dev demo JWTs --
// identical on every machine that runs `supabase start`, and only valid
// against a local 127.0.0.1 stack. Not secrets; safe to default here so this
// suite runs with zero setup against the local Docker stack, in CI or not.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Bypasses RLS entirely -- used only to set up/tear down fixtures, never to
// make the assertions themselves (those go through each user's own client so
// the real policies are what's actually being exercised).
export const serviceClient: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export type TestUser = {
  id: string
  email: string
  client: SupabaseClient
}

export async function createTestUser(): Promise<TestUser> {
  // Kept short and deliberately: handle_new_user() defaults profiles.display_name
  // to this email, and display_name is varchar(50) -- a longer email here fails
  // user creation entirely (the trigger's exception rolls back the whole
  // auth.users insert). See tests/rls/known-issues.test.ts, which pins this down
  // as a real production bug rather than just working around it silently here.
  const email = `t${randomUUID()}@ex.co`
  const password = `Test-${randomUUID()}!`

  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`failed to create test user: ${error?.message}`)
  }

  // handle_new_user's trigger on auth.users fires the same way for
  // admin.createUser() as for a real signup, so the profiles row already
  // exists by the time we sign in below.
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(`failed to sign in test user: ${signInError.message}`)
  }

  return { id: data.user.id, email, client }
}

// Cascades (auth.users -> profiles -> everything else) clean up all of a
// test user's fixture rows automatically -- see the profiles_id_fkey and
// friends in supabase/schema.sql.
export async function deleteTestUser(userId: string): Promise<void> {
  await serviceClient.auth.admin.deleteUser(userId)
}

export async function deleteTestUsers(userIds: string[]): Promise<void> {
  await Promise.all(userIds.map(deleteTestUser))
}

export async function promoteToRole(
  userId: string,
  role: 'moderator' | 'super_admin'
): Promise<void> {
  const { error } = await serviceClient
    .from('profiles')
    .update({ is_admin: true, admin_role: role })
    .eq('id', userId)
  if (error) {
    throw new Error(`failed to promote test user to ${role}: ${error.message}`)
  }
}
