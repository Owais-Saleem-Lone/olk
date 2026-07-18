---
name: verify
description: How to stand up the local Supabase stack and drive OLK end-to-end (browser + raw REST) to verify a change instead of just building/typechecking it.
---

# Verifying OLK changes at runtime

OLK is Next.js 16 (App Router) + Supabase (Postgres/Auth/Storage/RLS). Most
interesting behavior (RLS policies, triggers, notification guards) can't be
checked by `tsc`/`eslint`/`vitest` alone — it only shows up against a real
Postgres instance. This is the recipe that worked for verifying the Clubs
Events feature.

## 1. Bring up local Supabase (Docker must already be running)

```bash
npx supabase start   # first run: prints local anon/service_role JWTs + Studio/Mailpit URLs
npx supabase db reset  # wipes local DB and re-applies every migration in supabase/migrations/ from scratch
```

`db reset` is the real test of a new migration — it fails loudly on bad SQL.
If containers are stopped from a previous session (`docker ps -a` shows
`Exited`), run `npx supabase stop` then `npx supabase start` to get a clean
boot rather than resuming a stale container.

Get local credentials any time with `npx supabase status -o env` (shows the
legacy JWT-style `ANON_KEY`/`SERVICE_ROLE_KEY`, not just the newer
`sb_publishable_*`/`sb_secret_*` keys — this codebase's `src/lib/supabase/*`
helpers read `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the legacy JWT one).

## 2. Point the app at local instead of remote

`.env.local` in this repo points at the **remote** Supabase project by
default and is NOT safe to overwrite carelessly — back it up first:

```bash
cp .env.local .env.local.remote-backup
```

`.env.docker` (gitignored, not present by default) is what `npm run
env:local` copies into `.env.local`. If it doesn't exist yet, create it with
the local stack's URL + keys:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from `supabase status -o env`>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from `supabase status -o env`>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then `npm run env:local && npm run dev`. **When done, restore**
`.env.local` from the backup — don't leave the repo pointed at local.

## 3. Drive it with a real browser

No Playwright/Puppeteer in this repo's own deps, but a global npx cache with
a cached Chromium binary is often already available
(`npx --no-install playwright --version`, check `~/Library/Caches/ms-playwright`
for `chromium-*`). If so, `npm install playwright` in a scratch dir (not this
repo) and drive the app for real — register via `/register`, log in via
`/login`, click through forms exactly like a user. Signup auto-confirms
locally (`enable_confirmations = false` in `supabase/config.toml`) even
though the UI shows a stale "check your email" message — verify login state
by navigating to a protected route like `/browse` instead of trusting the
on-screen copy.

## 4. Seed data that's gated behind app-level rules

Club creation requires 5+ completed exchanges and zero reports
(`check_club_creation_eligibility` trigger). Fastest way to satisfy it for a
test user: insert one `books` row (any owner) then 5 `book_requests` rows
with `status='returned'` and `requester_id` = the test user — the unique
index on `book_requests` only covers active statuses, so all 5 can reference
the same book. Do this via `docker exec supabase_db_olk psql -U postgres -d
postgres -c "..."` (works even though there's no local `psql` client
installed — the CLI lives inside the db container).

## 5. Push past the UI — hit PostgREST directly

The real security boundary is RLS, not a disabled button. For anything
gated by a policy (membership-only RSVP, capacity limits, etc.), sign up a
genuinely non-qualifying user via `/auth/v1/signup`, grab its
`access_token`, and POST straight to `/rest/v1/<table>` with that token —
confirm you get `403`/`42501`, not just that the button is hidden. This is
how the "capacity only checked client-side" gap in the Events feature was
found (`event_rsvps` INSERT policy needed a `capacity` check added
alongside the `visibility` one).

## Gotchas hit during this pass

- `docker exec supabase_db_olk psql ... -tA -c "INSERT ... RETURNING id"`
  glues the row and the `INSERT 0 1` status tag together in some psql
  invocations — pipe through `grep -E '^[0-9a-f-]{36}$'` to isolate the UUID.
- `clubs.member_count` had a real off-by-one: the column `DEFAULT 1`
  double-counted the creator once the atomic trigger (which fires on every
  `club_members` insert, including the creator's own row insert in
  `clubs/create/page.tsx`) was added. Caught by comparing
  `clubs.member_count` to `count(*) from club_members` after creating a
  fresh club with just its creator — should be 1, was 2.
