# Contributing to OLK

OLK (Open Library Kashmir) is a community book-sharing platform, built as volunteer open-source work. This file is the fast path to a correct pull request. For the *why* behind the architecture — Next.js routing, Supabase/RLS, the admin subsystem, deployment — read **[`Guide/Document/main.pdf`](Guide/Document/main.pdf)** (compile `Guide/Document/main.tex` yourself if you want the source). That manual is the textbook; this file is the doorway.

If you haven't set up the project yet, do that first via the [README's Getting Started section](README.md#-getting-started) — local Supabase via Docker, `.env.local`, `npm run dev`. Don't come back here until `npm run dev` works.

## Before you open a PR: the non-negotiable rules

These aren't style preferences — each one exists because breaking it caused a real problem in this project before.

1. **Never hand-create a file in `supabase/migrations`.** Always run:
   ```bash
   npx supabase migration new your_migration_name
   ```
   Migrations apply in filename order — the timestamp *is* the dependency graph. A hand-written filename can collide with or misorder against another migration, and that failure is much harder to debug than typing the command above.

2. **After a batch of migrations, regenerate the schema dump:**
   ```bash
   npx supabase db dump --local --schema public > supabase/schema.sql
   ```
   `supabase/schema.sql` is a reference dump, not a source of truth — but a stale one misleads the next person who greps it. If it and `supabase/migrations` ever disagree, the migrations directory wins.

3. **`npm run lint` and `npm test` must both pass clean before you open a PR.** This is exactly what CI (`.github/workflows/ci.yml`) runs on every push and PR against `main` — if it's not clean locally, it won't be clean in CI either.

4. **If your change touches RLS policies or admin roles, run the RLS integration suite** (`supabase start && supabase db reset && npm run test:rls`) and add a case for what you changed if the suite doesn't already cover it. It exercises real policies against a live local Supabase stack as more than one role — a regular user *and* at least a `moderator` account, not just `super_admin` — since RLS bugs that only restrict access are invisible if every check you run already has full access.

5. **No `any` types.** The codebase is currently 100% free of them — keep it that way. If you're fighting a type, that's usually a sign the shape needs narrowing, not silencing.

6. **If you change `src/instrumentation.ts` or anything else feeding Sentry, verify against the live Sentry API — not just a local log.** A local check can say a fix worked (a `beforeSend` hook setting `in_app: true`) while Sentry's backend silently discards it on ingest and shows something different in the dashboard. Trigger a real event, then confirm with `curl` against the Sentry API (`Guide/Document/main.pdf`, Chapter 21's Sentry-triage entry) before calling it fixed.

## Branch names and commits

- Branch names: `type/short-description` — `feature/club-events`, `fix/browse-pagination`, `docs/security-policy`, `chore/upgrade-next`.
- Commit messages: short, imperative, present-tense, describing the **outcome**, not the mechanism — e.g. *"Add distance radius filter to Browse"*, not *"changed some stuff in browse/page.tsx"*. Look at `git log` for the tone the project already uses.

## Opening a pull request

- Keep PRs scoped to one thing. A bug fix doesn't need a drive-by refactor riding along with it.
- Describe *why*, not just *what* — the same discipline this project's migration comments already follow.
- Link the issue it closes, if there is one.
- The PR template will checklist the items above; fill it in honestly rather than deleting it.

## Finding something to work on

Check the [Issues page](https://github.com/Owais-Saleem-Lone/olk/issues). If nothing is labeled yet for newcomers, comment on an issue that looks approachable and ask before starting large work — it saves everyone a wasted PR.

## Code of conduct and security

- All contributors are expected to follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Found a security or privacy issue (this app handles real users' approximate locations and private messages)? **Do not open a public issue.** See [`SECURITY.md`](SECURITY.md) for how to report it privately.

## License

OLK is licensed under the AGPLv3 (see [`LICENSE`](LICENSE)). By contributing, you agree your contributions are licensed under the same terms.
