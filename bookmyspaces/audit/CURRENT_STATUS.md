# CURRENT_STATUS.md

Last updated: 2026-07-11, during active roadmap execution.

## Where things stand

- **Branch:** `remediation/phase-0-audit-followup` (off `main`), safety tag `pre-remediation-baseline` in place. A second safety tag point exists implicitly via the full-repo backup bundle described below.
- **Build/TypeScript baseline:** `npx tsc --noEmit` passes with 0 errors after every change made so far. `npx next lint` clean (one pre-existing, unrelated `<img>` warning). `npx vitest run` 11/11 passing.
- **Phase 0 (Safety Checkpoint):** ✅ Complete, including ISS-025 (stray root file review + git history rewrite).
- **Phase 1 / Phase 9 early item:** ISS-040 done, ISS-031 (test framework scaffold) done.
- **Phase 4/5/6 quick wins done:** ISS-042 (unawaited email write), ISS-047 (WhatsApp pricing), ISS-020/ISS-019 (misnamed route files restored), ISS-032 (Tailwind config resolved).
- **Phase 2 (Authentication) — ✅ Complete.** Per user's explicit "Yes, implement it now" decision:
  - ISS-001: `src/middleware.ts` now does a real Supabase session check with a public-page allowlist.
  - ISS-003: admin routes use `requireRole()` instead of a raw client-editable role check.
  - ISS-004: WhatsApp webhook verifies Meta's HMAC signature.
  - ISS-033: Server Actions CSRF origins locked down.
  - ISS-002 (batches 1-3, all done): every staff-facing API route now calls `requireAuth()`/`requireRole()`. Confirmed-public routes (`proposals/[id]/pdf`, `proposals/[id]/preview`, `proposals/track-view`, `chat`) were deliberately left open after tracing their actual callers.
  - **Not yet done:** live click-through test of login/logout/redirect behavior — this sandbox has no network egress to Supabase, so verification so far is `tsc`/`lint`/`vitest`/diff-review only. Recommend a manual pass before deploying.
- **ISS-027/ISS-028 — ✅ Complete.** Consolidated the two divergent OAuth callback implementations onto one shared handler (`src/lib/auth-callback.ts`); both URL paths kept alive since it's unknown which one the live Supabase project's redirect-URL config actually points to. Fixed the broken `/auth/auth-code-error` 404 target — failures now redirect to `/auth/login?error=callback_failed`, which the login page now displays as a real message.
- **ISS-017 — ✅ Complete.** New cron route `src/app/api/cron/escalations/route.ts` wires the already-written `evaluateEscalation`/`applyEscalation` into a scheduled job (every 6 hours), registered in `vercel.json`, per the user's "Scheduled job (cron)" decision.
- **Investigated but not remediated (blocked by sandbox file-deletion permissions, not by risk):** ISS-013 (duplicate migration file), ISS-021 (empty directories), ISS-022 (stray zip). All three confirmed safe to delete; flagged for the user to `rm` directly on their own machine — see OPEN_ISSUES.md.
- **Remaining open, Ready-to-start items:** ISS-005 (zod validation across routes), ISS-034/036/037/038 (env var / security-header cleanup), ISS-041 (real email provider — needs external SMTP credentials), assorted Deferred-priority items. See OPEN_ISSUES.md for the full list.

## Final decisions received from user (2026-07-11)

1. **ISS-006:** Hybrid architecture — session-scoped Supabase client for all user-facing CRUD; service-role retained only for background jobs, scheduled automation, AI processing, imports/exports, admin/system operations.
2. **ISS-009/ISS-010/ISS-049:** Live database is the source of truth. Must verify tables/columns/views/functions/triggers/policies/indexes/constraints, then reconcile app ↔ migrations ↔ live DB. Never assume migrations are complete.
3. **ISS-015/ISS-017/ISS-018:** Do not delete immediately. Investigated all three — all confirmed genuinely unfinished, higher-quality features that were never wired in, not obsolete code. Per decision: complete, integrate, and test each. `followup-engine.ts`'s one function is superseded by `followup-rules.ts` and will be removed once the latter is integrated.
4. **ISS-023:** Leave the backup folder untouched. No action.
5. **ISS-025:** Purge the PII-bearing files from git history entirely, not just going forward. Done locally (see Security note); push to origin requires the user's own GitHub credentials, which are not available in this sandbox.
6. **Phase 2 authentication:** Proceed now, accepting that this sandbox cannot live-test login against Supabase — verification is static (tsc/lint/tests/diff) until a manual click-through is done separately. Now complete.
7. **ISS-017 trigger point:** Scheduled job (cron), matching the existing `/api/cron/followups` pattern, rather than inline in webhooks. Now complete.

## Live DB reconciliation — complete (carried over from prior session)

Full reconciliation is written up in `LIVE_SCHEMA_AUDIT.md`, `SCHEMA_DRIFT_REPORT.md`, `DATABASE_RECONCILIATION.md`. A single additive, idempotent migration (`supabase/migrations/009_document_undocumented_production_objects.sql`) has been drafted and self-reviewed as safe, but **still awaits the user running it in the Supabase SQL Editor** — this sandbox has no live DB write path (network egress to Supabase is blocked).

## Security note — ISS-025

`latest.json` and `logs.json` (production log-export dumps at the project root) contained a real customer's name, unmasked phone number, and message content, committed to git in commit `43b6a15` on `main` (which has a GitHub origin remote). No full API keys/passwords were exposed — only a truncated, non-exploitable WhatsApp token prefix. Per the user's explicit decision, git history was rewritten (via `git-filter-repo`, on a clean `/tmp` clone backed by a full pre-rewrite bundle) to strip these files from every commit on every affected branch/tag (`main`, `remediation/phase-0-audit-followup`, and the 2 tags that post-date the offending commit). Verified: zero commits anywhere reference these files after the rewrite; the one unaffected branch checked is byte-identical before/after. Both files are also now genuinely empty (0 bytes) in the current working tree, and `.gitignore` prevents them from silently reappearing.

**Two full-repo bundles were saved to the outputs folder for the user:**
- `rajubmp-full-repo-backup-pre-history-rewrite.bundle` — complete pre-rewrite state (rollback point).
- `rajubmp-history-rewritten-CLEAN.bundle` — the verified-clean, rewritten history, ready to push.

**Action needed from the user:** push the rewritten history to `origin` from a machine with GitHub credentials (exact commands in IMPLEMENTATION_LOG.md's ISS-025 entry), then have any other existing local clones/collaborators re-clone or hard-reset to the new history.

## Process note — file-write reliability on this mount (important for whoever continues this work)

The Edit tool has silently truncated files mid-write repeatedly this session — most recently `src/app/api/leads/[id]/stage/route.ts`, `src/app/auth/login/page.tsx`, and `vercel.json` during the ISS-002/027/028/017 work — including live route files and config, each time caught immediately by a routine `tsc --noEmit` (or, for `vercel.json`, `python3 -c "import json; json.load(...)"`) check and fixed via the bash heredoc-to-tempfile-then-`cp` pattern. Separately, "emptying" a file via the Write tool was found to null-byte-pad the file to its original length rather than truncating it — plain bash truncation (`: > file`) was needed instead. **Going forward: always independently verify any file write on this mount with `wc -c` / `tail -c` in the shell tool (and, for JSON, an actual parse) — do not trust the editing tool's own success message alone.**

## What is safe to continue without further input

- Repo-hygiene deletions confirmed safe but blocked by mount permissions: delete `C:\rajubmp\007_missing_tables.sql` (ISS-013, confirmed byte-identical duplicate), the 4 empty `{...}` directories under `src/app/api` (ISS-021), and `src/app/api/proposals/[id]/invoice/files.zip` (ISS-022, confirmed old/superseded code, no unmerged work) — all three can be done directly from the user's own machine with a plain `rm`.
- ISS-005 (zod validation), ISS-034/036/037/038 (env var / security header cleanup) — all unblocked, no external credentials needed, continuing automatically.
- Remaining non-schema, non-auth Ready items from `OPEN_ISSUES.md`.

## Next actions — waiting on user

1. Run `supabase/migrations/009_document_undocumented_production_objects.sql` in the Supabase SQL Editor and confirm success (unblocks ISS-006/015/017/018 application-level wiring, and ISS-017's cron route once escalation rules need the newer schema fields it documents).
2. Push the rewritten git history per the ISS-025 handoff commands above (this sandbox cannot do this — no GitHub push credentials available).
3. Manually click-test login/logout/redirect behavior for the new middleware (ISS-001) and the OAuth callback consolidation (ISS-027/028) — this sandbox has no network path to Supabase to do this itself.
4. Delete the 3 confirmed-safe stray files/directories (ISS-013/021/022) directly on your own machine.
5. Provide a real SMTP/transactional email provider API key (SendGrid/Resend/SES) to unblock ISS-041, if/when that's wanted.

## Deferred feature request (from user, 2026-07-12) — room booking improvements

User asked for room-booking-specific fields on proposals: check-in date and check-out date (instead of a single event date), a package selector, and a complimentary/chargeable breakfast option. Explicitly deferred by the user ("let's finish the project first, will add new with the need of the hour") in favor of completing the current remediation work first. Revisit when the user is ready — will need a small additive migration (new columns on `proposals` or a related table) plus UI changes to the proposal creation form and proposals list.

---

## 2026-07-12 session addendum

**Environment:** This session ran in a sandbox with no network egress to Supabase or the production Vercel URL, and no Claude in Chrome extension connected — confirmed by direct connectivity tests, not assumed. Work this session was therefore code audit + static verification (tsc/lint/vitest) only, continuing the pattern already established throughout this file for prior sandbox-only sessions. Live click-through testing was NOT possible this session.

**Completed this session:** ISS-026, ISS-029, ISS-034 (confirmed already done by an earlier session), ISS-036, ISS-050, ISS-037 (one remaining gap), ISS-038, ISS-008, ISS-005 (partial — 3 of 31 routes: `POST /api/leads`, `PATCH /api/leads`, `PATCH /api/leads/[id]/stage`). Full detail in IMPLEMENTATION_LOG.md and COMPLETED_ISSUES.md.

**New bug found and fixed (not from the original 52-item register):** Kanban board (`kanban/page.tsx`) and the Dashboard (`HotLeadDashboard.tsx`) tracked lead pipeline stage via two different, unsynced database columns — `status` (Kanban) vs `lead_stage` (Dashboard). Neither view's writes updated the other's column. Standardized on `lead_stage`. This is the same class of bug as the auth cookie-interface bug documented above (a silent divergence between two write paths that should have stayed in sync) — found by code audit, not live testing, since the live testing already done this project covered proposal creation/email but not kanban or lead management.

**New security gap surfaced (not previously flagged):** `CRON_SECRET` and `WHATSAPP_APP_SECRET` are both correctly documented in `.env.example` and read by live route code, but were missing from the actual `.env.local`. Both routes fail open (unauthenticated) by design when their secret is unset — meaning `/api/cron/followups`, `/api/cron/escalations`, and the WhatsApp webhook's signature check are all currently running with no protection in production. Generated and added a real `CRON_SECRET`; `WHATSAPP_APP_SECRET` cannot be generated (must come from Meta's dashboard) and remains unset.

**Anomaly flagged, unresolved — needs the user's direct attention:** this working copy (`C:\rajubmp\bookmyspaces`, as mounted this session) has no `.git` directory at all. Earlier entries in this file describe a `remediation/phase-0-audit-followup` branch, a `pre-remediation-baseline` safety tag, and a completed `git-filter-repo` history rewrite that stripped exposed customer PII from history — none of that is present in this copy. Not investigated further here (git recovery is destructive-adjacent and the user's call); the practical consequence is that every change made across every session, including this one, currently has no version-control safety net in this working copy.

**Still not done, still needs live testing whenever browser/computer-use access is available:** the original 6 highest-risk workflows the user asked to walk through (lead management, kanban, proposal editing, invoice generation, payment tracking, proposal sharing) — only proposal creation and proposal email have actually been live-tested end-to-end so far (see the two 2026-07-12 entries above in IMPLEMENTATION_LOG.md). Kanban drag-and-drop specifically should be the first thing verified live, since this session's fix to it could not be click-tested.
