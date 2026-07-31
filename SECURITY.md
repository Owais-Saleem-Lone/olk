# Security Policy

OLK stores real users' approximate locations, private messages, and account data. If you find a security or privacy vulnerability, please report it privately — **not** as a public GitHub issue. A public issue on a live app is a live exploit disclosure.

## Reporting a Vulnerability

Email **osaleem.kash@proton.me** (temporary contact until an official OLK email exists) with:

- A description of the issue and its impact (what data or access it exposes)
- Steps to reproduce, or a proof of concept
- Any suggested fix, if you have one (optional)

Do not open a public issue or discuss the details anywhere public until it's resolved.

## What counts as in scope

- Authentication/authorization bypass (including Supabase RLS policy gaps that expose one user's data — location, messages, bookings — to another)
- Privilege escalation into admin/moderator functionality
- Injection, XSS, CSRF, or SSRF in any app route or Supabase RPC
- Exposure of environment variables, service-role keys, or other secrets
- Any way to bypass the maintenance-mode or feature-flag gate in `proxy.ts`

## What's out of scope

- Missing security headers or best-practice nitpicks with no demonstrated exploit
- Denial-of-service via brute force or resource exhaustion (report it, but it won't be treated as urgent the way a data-exposure bug is)
- Issues in third-party dependencies with no OLK-specific exploit path — report those upstream instead

## Response expectations

This is a volunteer-run project without a dedicated security team. There's no guaranteed SLA, but a genuine data-exposure report will be prioritized over feature work. You'll get an acknowledgment as soon as the maintainer sees it.

## Supported versions

OLK deploys continuously from `main` — there are no maintained release branches or old versions to patch. A fix means a fix on `main`.
