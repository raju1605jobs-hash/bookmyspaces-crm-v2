# CHANGELOG.md

All notable changes to BookMySpaces CRM made during the roadmap execution (`audit/MASTER_ISSUE_REGISTER.csv`). Format loosely follows Keep a Changelog.

## [Unreleased] — remediation branch `remediation/phase-0-audit-followup`

### Fixed
- **ISS-040:** Removed 5 debug `console.log` statements in `src/app/api/proposals/[id]/invoice/route.ts` that were writing payment amounts, receipt numbers, and proposal IDs to production logs on every invoice view.
- **ISS-042:** `src/app/api/proposals/email/route.ts` now awaits the `proposals` bookkeeping update (`email_sent_at`/`status`) and logs any failure instead of firing-and-forgetting with a swallowed error.
- **ISS-047:** WhatsApp auto-reply pricing (`src/app/api/whatsapp/webhook/route.ts`, `buildAutoReply`/new `buildPricingReply`) now queries the live `packages` table for current Silver/Gold/Platinum pricing instead of a hardcoded, incorrect generic room rate.
- **ISS-020/ISS-019:** Restored the two misnamed, never-registered API route files under correct Next.js filenames: `src/app/api/leads/[id]/stage/route.ts` (lead pipeline stage transitions, `lead_stage` confirmed live) and `src/app/api/proposal/share/[token]/route.ts` (proposal share-token lookup). Old misnamed files left in place (mount doesn't allow deletion) with a superseded-file comment.
- **ISS-032:** Confirmed `tailwind.config.js` is the file Tailwind actually resolves (verified against `tailwindcss`'s own `resolveConfigPath.js`); marked `tailwind.config.ts` as dead/superseded with an explanatory header comment instead of silently leaving two divergent configs.
- **ISS-001:** `src/middleware.ts` now performs a real Supabase session check (`createMiddlewareAuthClient`) with a public-page allowlist (`/`, `/auth/*`, `/proposals/share/*`); previously any request could reach protected pages with no session at all. Unauthenticated page requests redirect to `/auth/login?redirect=<path>`.
- **ISS-003:** `src/app/api/admin/users/route.ts` replaced a raw `user.role !== 'admin'` check with the shared `requireRole()` helper (`['admin','manager']` for GET, `['admin']` for PATCH/POST).
- **ISS-002 (batches 1-3):** Added `requireAuth()` session checks to every staff-facing API route that previously had none: `analytics`, `dashboard/revenue`, `dashboard/stats`, `leads`, `leads/hot`, `leads/summary` (batch 1); `proposals/[id]/invoice`, `proposals/[id]/receipt`, `proposals/[id]/payment`, `proposals`, `proposals/intelligence`, `proposals/email` (batch 2); `whatsapp/campaigns`, `whatsapp/send`, `campaigns`, `conversations`, `followups`, `knowledge`, `leads/[id]/stage` (batch 3). Confirmed and deliberately left public (traced actual callers rather than assuming): `proposals/[id]/pdf`, `proposals/[id]/preview`, `proposals/track-view`, `chat` (anonymous-visitor chatbot widget).
- **ISS-027:** Consolidated the two divergent OAuth/magic-link callback implementations (`src/app/api/auth/callback/route.ts`, `src/app/auth/callback/route.ts`) into a single shared handler (`src/lib/auth-callback.ts`); both URL paths are kept alive (unknown which is configured in the live Supabase project) and now behave identically.
- **ISS-028:** Fixed the OAuth failure redirect target — previously pointed at a nonexistent `/auth/auth-code-error` page (404); now redirects to `/auth/login?error=callback_failed`, and the login page displays a real error message for that case.
- **ISS-017:** Wired `escalation-engine.ts` (`evaluateEscalation`/`applyEscalation`) into a new scheduled route, `src/app/api/cron/escalations/route.ts`, per the user's decision to trigger escalation from a cron job rather than inline in webhooks.

### Added
- Git branch `remediation/phase-0-audit-followup` and tag `pre-remediation-baseline` as a safety checkpoint for this entire remediation effort.
- **ISS-031:** Added Vitest test framework (`vitest.config.ts`, `npm test` script) and a first real test suite (`src/lib/lead-scorer.test.ts`, 11 tests) covering the lead scoring engine's budget parsing, temperature thresholds, score clamping, and tag-dedup logic.
- Shared authorization helper `src/lib/auth-guard.ts` (`requireAuth()`, `requireRole()`), used by every route touched in ISS-001/002/003.
- Shared OAuth callback handler `src/lib/auth-callback.ts` (ISS-027).
- New cron route `src/app/api/cron/escalations/route.ts`, registered in `vercel.json` on a 6-hourly schedule (ISS-017).

### Changed
- `.gitignore`: added `latest.json`, `logs.json`, `logs.txt`, `deployed_route.txt` (ISS-025 — these are Vercel log-export dumps that have contained customer PII; must never be committed again).
- **ISS-033:** `next.config.js` — Server Actions `allowedOrigins` restricted from `['*']` to `['bookmyspaces.in', 'www.bookmyspaces.in', '*.vercel.app', 'localhost:3000']`.
- `vercel.json`: added the `cron/escalations` function entry and cron schedule (ISS-017).

### Removed
- `latest.json`, `logs.json` contents emptied in the working tree (ISS-025 — contained committed customer PII; see Security note below). `git`, `npm` confirmed 0-byte/harmless, left in place.

### Security
- **ISS-040** above is a security-relevant fix (sensitive financial data no longer logged in plaintext).
- **ISS-025:** Reviewed all stray root files. `latest.json`/`logs.json` contained committed customer PII (name, phone numbers, message content) from production log exports (commit `43b6a15`). Emptied both files in the working tree, added them to `.gitignore`, and rewrote git history (via `git-filter-repo`, on a clean clone backed by a full pre-rewrite bundle) to strip them from every commit on every branch/tag. Local rewrite complete and verified (zero commits reference these files anywhere in history; unaffected branches confirmed byte-identical). **Push to `origin` still required from a machine with GitHub credentials — see IMPLEMENTATION_LOG.md for exact handoff commands.** No full API keys/passwords were found exposed (only a truncated, non-exploitable WhatsApp token prefix).
- **ISS-004:** `src/app/api/whatsapp/webhook/route.ts` now verifies Meta's `X-Hub-Signature-256` HMAC-SHA256 signature before processing inbound webhook payloads; fails closed (403) when `WHATSAPP_APP_SECRET` is configured and the signature is invalid, fails open (with a logged warning) only when the secret is not yet configured.
- **ISS-001/ISS-003/ISS-002:** Closed the largest outstanding gap in the audit — the entire CRM was reachable without authentication (no middleware session check, no per-route auth checks on ~25 API routes, admin routes gated by a client-editable role field instead of a server-side check). All three are now fixed together as "Phase 2 authentication." Not live-click-tested end-to-end (this sandbox has no network access to Supabase); verified via `tsc`, `next lint`, and `vitest` only — a manual login/click-through pass is still recommended before this ships.

## [Unreleased] — 2026-07-12 additions

### Fixed
- Missing sign-out button: `src/components/layout/CRMLayout.tsx` (the layout actually in use) had no way to log out at all. Added a working "Sign out" button, live-tested end-to-end.
- **ISS-041:** Proposal emails now actually send via a real email provider (Resend) instead of only returning a `mailto:` link. Also discovered and fixed a deeper issue: the "Email" button on the Proposals page (`src/app/(crm)/proposals/page.tsx`) never called the backend route at all — it opened its own separate `mailto:` link directly. It now calls the real send route.
- **ISS-037 addendum:** `.env.example` updated with `RESEND_API_KEY`/`EMAIL_FROM` documentation.

### Added
- New email-sending system: `src/lib/email/provider.ts`, `templates.ts`, `send.ts` — provider-agnostic (Resend today, swappable later), with reusable templates and full delivery logging.
- `supabase/migrations/011_email_log.sql` — new table recording every outgoing email and its delivery status.
- Four new staff-triggered email routes: invoice, payment reminder, follow-up, booking confirmation.

### Security
- Every new email route requires staff login (`requireAuth()`), matching the app-wide ISS-002 pattern.
