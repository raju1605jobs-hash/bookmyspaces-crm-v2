# BookMySpaces V3 — Production Readiness Review

Repository-wide review, deployment/infrastructure/security/operational/migration/rollback risks only — no cosmetic findings. Every item below is backed by a specific file, commit, or command output; nothing is speculative. Branch `feature/v3-omnichannel-platform`, HEAD `e4481be`.

## How to read this

**Critical** = must be resolved before real customer/payment traffic touches this system.
**High** = must be resolved before or immediately at launch; workable short-term with an explicit accepted risk.
**Medium** = should be resolved soon after launch; not a launch blocker.
**Low** = cosmetic/hygiene, no functional or security impact.

---

## Critical

### C1. Migrations 012/013 not applied to the live database
**Evidence:** Every session across this project's history (7 consecutive engineering sessions, this one included) has confirmed no Supabase network egress from any available sandbox (`curl` to the project host returns a 403 from the sandbox's own egress proxy, re-confirmed this session). `PRODUCTION_DEPLOYMENT_GUIDE.md` §3 has the exact command.
**Impact:** The entire Reservation Platform — Reservations, Availability, Pricing, the Reservation Calendar, and the Revenue Dashboard's Bookings/Confirmed KPIs — cannot function against real data until this runs. The application code degrades gracefully where it can (Revenue Dashboard shows a "not live yet" label rather than crashing), but the core reservation workflow simply does not work pre-migration.
**Resolution:** Not fixable from this environment. Raju must run `npm run db:migrate:v3` then `npm run db:smoke-test:v3` from a machine with real Supabase access — this is an infrastructure action, not an engineering one.

### C2. `WHATSAPP_APP_SECRET` unset — webhook signature verification unenforced
**Evidence:** Confirmed absent from `.env.local` this session (and every session since it was first found). `src/app/api/whatsapp/webhook/route.ts`'s `verifySignature()` logs a warning and accepts the request anyway when this secret is unset.
**Impact:** The WhatsApp webhook is a public, unauthenticated POST endpoint by necessity (Meta calls it directly). Without signature verification, anyone who discovers the webhook URL can POST arbitrary payloads that the application will process as if they came from Meta — potentially injecting fake customer messages, manipulating conversation/lead state, or probing for further vulnerabilities. This is a real, exploitable gap in a production system that will hold real customer and payment data.
**Resolution:** Retrieve the App Secret from the Meta for Developers dashboard (Settings → Basic) and set it in both `.env.local` and Vercel's environment variables before go-live. Not an engineering task — requires Raju's access to the Meta app.

---

## High

### H1. Migration 004 not applied — Campaigns feature is broken in production if enabled
**Evidence:** `broadcast_campaigns`/`festival_calendar` (migration 004) confirmed unreachable live; `src/app/api/campaigns/route.ts` has no fallback and returns a 500 on every action if the tables don't exist (found during V1 Release Readiness review, see `VERSION1_RELEASE_READINESS_REPORT.md`).
**Impact:** Only if the Campaigns nav link is left visible without applying migration 004 — a real operator-facing broken feature, not a security or data-integrity risk.
**Resolution:** Product Owner decision, not an engineering fix: apply migration 004 alongside 012/013, or hide the Campaigns nav link until it is. Either resolves this item completely.

### H2. `npm run build` has never been confirmed to complete
**Evidence:** Every engineering session across this project — 7 consecutive sessions — has attempted this and hit the same sandbox limitation: each shell invocation runs in an isolated process namespace with no cross-call persistence, so a Next.js production build (which takes longer than a single 40-second tool call) cannot run to completion in this environment. This is a confirmed environmental constraint, not a code defect — `tsc`/`eslint`/`vitest` all pass cleanly, which is the strongest available signal short of an actual build.
**Impact:** A real, if narrow, risk: something specific to the production build step (not caught by `tsc`/`eslint`/tests) could still fail. Low probability given a clean type-check, non-zero.
**Resolution:** Run `npm run build` on a real machine before deploying — the single highest-value five-minute action available to close this gap. Not fixable from this environment by construction.

### H3. No live UAT has ever been performed
**Evidence:** No sandbox session has had Supabase network access, so `USER_ACCEPTANCE_TEST_PLAN.md`'s 16 scenarios have never been executed against real data — every finding to date (including two real bugs found and fixed: the `bookings`→`reservations` mismatch and the `accepted_at` gap) came from static code/schema analysis, not live testing.
**Impact:** Static analysis has a real but bounded blind spot — Postgres-specific behavior (the smoke test's overlap-query check exists specifically because of this), timing/concurrency issues, and UI-level interaction bugs are not fully coverable without a live pass.
**Resolution:** Run the UAT operator checklist (this session's Phase 5 deliverable) against a real deployment before declaring launch-ready.

---

## Medium

### M1. No API rate limiting beyond the WhatsApp-specific in-app throttle
**Evidence:** `grep` for rate-limiting logic across `src` returns only `src/lib/queue.ts`'s per-phone-number WhatsApp send throttle; no general request-rate protection exists on public routes (`/api/chat`, `/api/proposals/[id]/preview`, the WhatsApp webhook itself).
**Impact:** A real gap for a production system, but not launch-blocking at expected initial traffic volumes for a single-property-group hospitality business.
**Resolution:** Deferred to `VERSION1_1_ROADMAP.md` Tier 1 — add edge-level rate limiting (Vercel/Upstash) as near-term post-launch hardening.

### M2. No error tracking / APM
**Evidence:** No Sentry-equivalent found anywhere in `package.json` dependencies or `src`; `logger.error()` calls go to Vercel's function logs only.
**Impact:** Slower detection of production issues post-launch — a real operational risk, not a pre-launch blocker given Vercel logs are a working (if manual) baseline.
**Resolution:** `VERSION1_1_ROADMAP.md` Tier 1 item; recommended as an early post-launch addition given real payment data will be flowing.

### M3. No dedicated `admin_audit_log` table
**Evidence:** RC1 found and partially fixed this (structured `logger.info()` calls capturing actor/target on admin actions) but flagged the complete fix — a real, queryable table — as a follow-up, not done.
**Impact:** Admin action history exists in logs but isn't easily queryable/permanent the way a real audit table would be.
**Resolution:** Small, well-scoped follow-up migration; `VERSION1_1_ROADMAP.md` Tier 1.

### M4. Backup restore has never been tested
**Evidence:** `BACKUP_AND_RESTORE.md` explicitly documents this — Supabase's automated backups exist (plan-tier dependent) but no session has had the live access needed to actually test a restore.
**Impact:** An untested backup is not a verified backup — real risk, standard for any project at this stage, not specific to a code defect.
**Resolution:** Test a restore against a throwaway Supabase project once real access exists, before go-live if time allows, otherwise as the first post-launch action.

---

## Low

### L1. Repo-root cruft
6 stale `.git.*` backup directories and 2 stray zero-risk files, confirmed safe but undeletable from every sandbox session to date (`rm` returns `Operation not permitted` on this mount). Needs a direct `rm` on Raju's machine. No functional impact — flagged every session since RC2, unchanged.

### L2. One pre-existing ESLint warning
`no-img-element` in `UserMenu.tsx` — cosmetic, non-blocking, unchanged across every session.

### L3. `WATI_BASE_URL`/`WATI_API_TOKEN` unset
Legacy WhatsApp provider, only used by `/api/health`'s status check and a transcription helper — not the live send/receive path (Meta Cloud API). No functional impact if intentionally unused.

---

## Explicitly Not Findings (checked, confirmed adequate)

- **Migration rollback:** all three relevant migrations (012, 013, 004) now have reviewed, idempotent-safe rollback scripts with explicit data-loss warnings — this was a real gap as recently as two sessions ago (004 had none) and is now closed.
- **Migration idempotency/ordering:** all three use `CREATE TABLE IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` throughout; execution order (012 → 013 → 004, independent) confirmed correct — see `DATABASE_VALIDATION.md` for the full breakdown.
- **SQL injection:** Supabase's parameterized query builder used throughout; no raw string-concatenated SQL found anywhere in application code across any session's review.
- **CSRF:** Server Actions' `allowedOrigins` configured in `next.config.js`.
- **Stored XSS:** found and fixed last session (`8e333d2`) in the proposal PDF/invoice templates — the one genuine security defect this project's review process has found in application code; closed.
- **Authentication/authorization:** every non-public route confirmed to use `requireAuth()`/`requireRole()`; the handful of deliberately public routes were traced to their actual callers and confirmed intentional.
