# External Services

A single reference for every third-party service OLK (Open Library Kashmir)
depends on — what it is, what it does for this project, and why it was
chosen over the alternatives. Meant to be the one file you (or anyone who
joins later) can hand to someone unfamiliar with the stack and have them
understand the full picture of what's running where.

Not committed with real secrets — only service names, purposes, and which
env vars/config carry the credentials. See `.env.local` / `.env.docker` /
the Vercel dashboard for actual values.

---

## 1. Domain registrar — [ FILL IN: e.g. Infomaniak ]

**What it is:** The company OLK's domain name is registered through and
whose DNS Zone panel controls where the domain points.

**Purpose for this project:** Owns the domain (name still to be chosen) that
everything else hangs off of — the public site URL, the Resend sending
domain (SPF/DKIM/DMARC records), and eventually the Supabase Auth email
sender address. Without a real registered domain, Resend cannot verify a
sending domain, so Supabase Auth is stuck on its default rate-limited
built-in mailer (2 emails/hour) — this is the actual blocker that started
the domain search.

**Why chosen:** [ FILL IN — reasoning discussed with your friend: price,
EU/Swiss data hosting, .app/.org support, DNS panel usability, etc. ]

**What plugs into it once registered:**
- DNS `A`/`CNAME` records pointing the domain at Vercel.
- DNS `TXT`/`DKIM` records Resend issues during its "Add Domain" verification
  flow.
- `NEXT_PUBLIC_SITE_URL` (Vercel env var) — the canonical site URL used in
  emails/links.

**Status:** Domain not yet registered/chosen. A placeholder domain
(`olkashmir.com`) was used throughout early development and is **not a real
owned domain** — every reference to it (Resend, `supabase/config.toml`'s
`admin_email`, the fallback strings in `send-notification-email.ts`) needs
updating once a real domain is picked.

---

## 2. GitHub — source control + CI

**What it is:** Hosts the git repository and runs CI via GitHub Actions.
Repo: `github.com/Owais-Saleem-Lone/olk`.

**Purpose for this project:**
- Single source of truth for the codebase (`main` branch).
- `.github/workflows/ci.yml` runs on every push to `main` and every PR: lint
  + unit tests in one job, and a full RLS (Row-Level Security) integration
  test job that spins up a real local Supabase stack via Docker, replays
  every migration from scratch, and runs `npm run test:rls` against it —
  this catches both broken app logic and migrations that don't apply
  cleanly in order.
- Issue/PR templates (`.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md`)
  standardize how bugs/features get reported, relevant since Owais plans to
  bring on interns/contributors.

**Why chosen:** Default, no real alternative was considered — free CI
minutes for a public/private repo of this size, tight integration with
Vercel (auto-deploy on push) is the deciding factor in practice.

---

## 3. Vercel — hosting + deployment

**What it is:** The hosting platform that builds and serves the Next.js app,
and runs its serverless functions and scheduled jobs.

**Purpose for this project:**
- Builds and deploys the Next.js 16 app on every push to `main` (and preview
  deployments for PRs).
- Runs the cron job defined in `vercel.json` — `/api/digest` on
  `0 8 * * 1` (weekly, Monday 08:00 UTC) — the weekly book-digest email job.
- Holds all production environment variables (Project Settings →
  Environment Variables): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Serves images from Supabase Storage via a configured `remotePatterns`
  allowlist (`*.supabase.co`) in `next.config.ts`.

**Why chosen:** Built by the same team as Next.js, so zero-config deploys
and first-class support for the framework's newer features (Turbopack,
Server Components, `instrumentation.ts`). Generous free tier suitable for a
pre-launch/early-traffic community project.

**Status:** Project exists but the production env vars listed above are not
yet set — this is an open item before real launch.

---

## 4. Supabase — database, auth, storage

**What it is:** An open-source Firebase alternative — hosted Postgres plus
built-in Auth (GoTrue), file Storage, and auto-generated REST/Realtime APIs
(PostgREST) on top of the database.

**Purpose for this project:** The entire backend. Specifically:
- **Postgres database** — all app data: `profiles`, `books`, `book_requests`,
  `messages`, `bookmarks`, `ratings`, `reports`, `clubs`, `club_members`,
  `club_posts`, `club_ratings`, `club_requests`, `book_progress`, `book_notes`,
  `platform_settings`, plus the clubs-events tables. Schema managed entirely
  through versioned migrations in `supabase/migrations/` (30+ as of last
  count).
- **Auth (GoTrue)** — email+password signup/login. The browser talks to
  Supabase Auth directly (never through the Next.js server), which is also
  why per-IP rate limiting on login/signup is handled by Supabase's own
  built-in defaults rather than needing app-level middleware.
- **Row-Level Security (RLS)** — every table's access control is enforced
  at the database layer via RLS policies, not in app code. This is also why
  the CI pipeline runs a dedicated RLS integration test suite.
- **Storage** — book cover images and similar user-uploaded files, served
  back through Vercel's image optimizer via the `*.supabase.co` remote
  pattern.
- **RPCs** — custom Postgres functions called from the app for anything
  that needs to run server-side with elevated logic, e.g.
  `get_books_nearby` (geo search), `get_club_eligibility`, the
  `admin_get_*` family used by the admin panel.

**Why chosen:** Open source (Owais's long-term goal is self-hosting this
same Supabase stack on a local server in Kashmir instead of staying on
Supabase's hosted cloud — see local Docker setup below), and it collapses
what would otherwise be three separate services (Postgres host, auth
provider, file storage) into one, with RLS giving strong per-row security
guarantees appropriate for a platform handling users' approximate location
and personal exchange data.

**Environments:**
- **Production:** hosted Supabase project `olk`, ref `eoturfpzalywzhxpywzf`,
  region `ap-south-1` (Mumbai) — chosen for proximity to actual users in
  Kashmir.
- **Local dev:** a local Docker stack driven entirely by the Supabase CLI
  (`npx supabase start` / `db reset`), no hand-written `docker-compose.yml`.
  `.env.local` is swapped between the two via `npm run env:local` /
  `npm run env:remote`, with `.env.remote` (gitignored) parking the
  hosted project's credentials for that swap.

**Status:** Production project exists and is live (the admin-role security
audit in commit `c96911e` was run directly against it). Still need to
confirm the `olk` project is definitively the one Vercel will point at in
production — never firmly nailed down as of the last session.

---

## 5. Resend — transactional email

**What it is:** A developer-focused transactional email API/service (send
emails via API call or SMTP relay), with domain verification via
DNS TXT/DKIM records.

**Purpose for this project, two separate uses:**
1. **App-originated notification emails** — `src/lib/send-notification-email.ts`
   sends things like the weekly book digest (via the `/api/digest` Vercel
   cron job, using `resend.batch.send()` for efficiency at scale) and other
   in-app notifications, gated on `RESEND_API_KEY`.
2. **Supabase Auth's SMTP relay** — Supabase's built-in auth mailer is
   throttled to 2 emails/hour by default, too low for real signup volume.
   `supabase/config.toml` has an `[auth.email.smtp]` block pointing
   Supabase Auth at Resend's SMTP endpoint (`smtp.resend.com:587`) so
   signup/password-reset/magic-link emails go through Resend's much higher
   limits instead.

**Why chosen:** Already had the notification-email use case built on
Resend before the SMTP-relay need came up, so reusing the same account for
both avoids running two separate email providers. Modern API, generous free
tier, and straightforward domain verification.

**Status:** Real Resend account and API key created; SMTP wiring verified
end-to-end locally (a real password-reset call reached Resend's servers and
correctly failed only on domain verification, confirming host/port/auth are
all correct). **Blocked on a real domain** — domain verification was
attempted against the placeholder `olkashmir.com` and will never complete
since that domain isn't owned. Domain region for the Resend project was set
to Tokyo (`ap-northeast-1`) — recommended by Resend for proximity to the
`ap-south-1` Supabase project and to end users in Kashmir.

---

## 6. Sentry — error monitoring

**What it is:** An application error-tracking and performance-monitoring
service — captures unhandled exceptions, stack traces (with real source
mapping), and basic performance data from both server and client.

**Purpose for this project:** Wired in via `@sentry/nextjs`
(`instrumentation.ts`, `instrumentation-client.ts`, and the
`withSentryConfig` wrapper in `next.config.ts`). Before this, there was
**zero visibility** into production errors — this closes that gap
identified in the original launch-readiness audit. `SENTRY_AUTH_TOKEN`
(only needed for uploading readable source maps at build time) means local
dev and CI need no Sentry setup at all — sourcemap upload is skipped
automatically when that token is absent.

**Why chosen:** Industry-standard for this use case, native Next.js
integration package maintained by Sentry itself, generous free tier for a
project at this traffic stage.

**Status:** Fully wired in code; `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
`SENTRY_PROJECT` exist in local env files but still need copying into
Vercel's production environment variables.

---

## 7. Development tooling & frameworks

These aren't hosted third-party services (nothing to sign up for or pay), but
they're core to how the project is built, tested, and kept correct — worth
documenting alongside the hosted services for a complete picture of what
"the stack" means.

**Next.js 16 (React 19)** — the application framework itself. Chosen for
first-class Vercel deployment support, Server Components (lets pages fetch
data server-side without hand-rolled API routes for most reads), and
built-in image optimization used for Supabase Storage-hosted book covers.
Runs on Turbopack (Next's Rust-based bundler) for both dev and build.

**TypeScript** — static typing across the whole app. Catches a large class
of bugs (wrong prop types, mismatched Supabase row shapes, etc.) at build
time rather than at runtime in production; the CI `lint` step and local
editor tooling both depend on it.

**ESLint** (`eslint.config.ts`, flat config) — static code-quality/style
checks, built on `eslint-config-next` (both the `core-web-vitals` and
`typescript` rule sets) plus one project-specific override tightening
`react-hooks/exhaustive-deps` to also cover the custom `useAsyncEffect`
hook. Runs in CI (`npm run lint`) on every push/PR — a lint failure blocks
merge via the GitHub Actions check.

**Vitest** — the test runner, in two separate configs:
- `vitest.config.ts` — fast unit tests (`npm test`), no external
  dependencies, runs `src/**/*.test.ts`.
- `vitest.integration.config.ts` — the RLS (Row-Level Security) integration
  suite (`npm run test:rls`), deliberately kept separate because these tests
  hit a real local Supabase/Postgres stack to verify database-level access
  control policies actually behave as intended — something a mocked unit
  test can't catch. This is the suite CI's `rls-tests` job runs after
  spinning up Supabase in Docker and replaying all migrations.

Chosen over Jest for faster startup/watch performance and native Vite/ESM
config compatibility with the rest of the toolchain.

**Tailwind CSS v4** (`postcss.config.mjs`, `@tailwindcss/postcss`) —
utility-first CSS framework used for all styling across the app. v4's
CSS-native config (no separate `tailwind.config.js` needed) is why there's
no such file in the repo — configuration lives in CSS itself via
`@theme`/`@import` directives.

---

## Env var → service map

Quick lookup of which service owns which environment variable (see
`.env.local` for where these currently live in local dev):

| Env var | Service |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `RESEND_API_KEY` | Resend |
| `RESEND_FROM_EMAIL` | Resend |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry |
| `SENTRY_ORG` | Sentry |
| `SENTRY_PROJECT` | Sentry |
| `SENTRY_AUTH_TOKEN` | Sentry (build-time only, source maps) |
| `CRON_SECRET` | Vercel (authenticates the `/api/digest` cron call) |
| `NEXT_PUBLIC_SITE_URL` | Used in emails/links — depends on the domain registrar |

---

## Open items before launch

- [ ] Register the real domain (registrar decision — see section 1).
- [ ] Complete Resend domain verification against the real domain.
- [ ] Replace every `olkashmir.com` reference (`supabase/config.toml`
      `admin_email`, `.env.*` `RESEND_FROM_EMAIL`,
      `send-notification-email.ts` fallback strings) with the real domain.
- [ ] Set all seven production env vars in Vercel (see table above).
- [ ] Configure Supabase Dashboard → Project Settings → Auth → SMTP
      Settings with the same Resend credentials, real domain.
- [ ] Confirm the `olk` Supabase project (`eoturfpzalywzhxpywzf`) is the one
      the Vercel production deployment actually points at.

(Full narrative history of this work is in the gitignored
`DEPLOYMENT_HANDOFF.md` at the repo root, if it still exists.)
