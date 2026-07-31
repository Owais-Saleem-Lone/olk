## What does this PR do, and why?

<!-- One or two sentences. Describe the outcome, not the mechanism. -->

## Related issue

<!-- Closes #___, or "None" -->

## Checklist

- [ ] `npm run lint` passes clean
- [ ] `npm test` passes clean
- [ ] If this adds a migration, it was created with `npx supabase migration new` (never hand-created), and `supabase/schema.sql` was regenerated if this is the last migration in a batch
- [ ] If this touches RLS policies or admin roles, `npm run test:rls` passes and covers the change (a regular user and at least a `moderator`, not just `super_admin`)
- [ ] No new `any` types introduced
- [ ] This PR is scoped to one thing (no drive-by refactors bundled in)

## Screenshots (for UI changes)

<!-- Before/after, if this changes anything visual -->
