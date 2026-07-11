# RISK_REGISTER.md

Risk assessment per implementation phase (Step 7). "Recovery Strategy" assumes Phase 0's backup/branch discipline is followed for every phase, not just Phase 0 itself.

## Phase 0 — Backup, Branching, Investigation

- **Business risk:** Low. No user-facing change.
- **Technical risk:** Low. Read-only investigation plus a backup operation.
- **Security risk:** Low, UNLESS ISS-025 reveals committed secrets/PII — in which case this phase's risk classification immediately escalates to Critical and triggers an out-of-band incident response (credential rotation, git history purge) before any other phase proceeds.
- **Deployment risk:** None (no deployment in this phase).
- **Data loss risk:** None if the backup step itself succeeds; the entire point of this phase is to prevent data loss in later phases.
- **Downtime risk:** None.
- **Recovery strategy:** N/A for the investigation tasks. For the backup itself: verify the backup is restorable (test-restore to a scratch project if the user's Supabase plan allows) before relying on it for anything later.

## Phase 1 — Critical Security (quick wins)

- **Business risk:** Low.
- **Technical risk:** Low. Deleting log statements and adding a test runner are both low-blast-radius, easily reverted.
- **Security risk:** Reduces risk (removes a data leak). If Phase 0 escalated to an incident, this phase's scope may expand to include the first remediation steps.
- **Deployment risk:** Low.
- **Data loss risk:** None.
- **Downtime risk:** None.
- **Recovery strategy:** Single-commit revert for the logging fix; remove test tooling if it somehow conflicts with the existing build (unlikely, but Vitest/Jest can occasionally clash with Next.js build tooling versions).

## Phase 2 — Authentication

- **Business risk:** HIGH if rushed. This is the phase most likely to lock out legitimate users (staff unable to log in, chat widget breaking for customers) if the public-route allowlist is incomplete or the middleware logic has an edge case.
- **Technical risk:** High. Touches 26+ files, the core request-handling path, and requires a real architectural decision (ISS-006) to be made correctly rather than defaulted into.
- **Security risk:** This phase both closes the single largest risk in the entire audit AND, if done carelessly, could introduce new gaps (e.g., an allowlist that's too permissive, or a session check that fails open instead of closed on error).
- **Deployment risk:** Medium-High. Should not be deployed as one giant change — deploy behind a feature flag or to a subset of routes first if the hosting setup allows, so a bad middleware rule doesn't take down the entire app at once.
- **Data loss risk:** None directly, but a broken RLS/auth interaction could theoretically expose data (not lose it) if done wrong.
- **Downtime risk:** Medium. A middleware bug can effectively "down" the app for all users (infinite redirect loop, or blocking legitimate traffic) even though the server itself is up.
- **Recovery strategy:** Keep the Phase 0 branch/tag ready for instant revert of `src/middleware.ts` specifically (smallest possible rollback unit for the highest-impact file). Roll out route-level auth changes in small batches (5-6 routes at a time) rather than all 26 at once, so a bad batch is easy to isolate and revert without re-doing the whole phase.

## Phase 3 — Database

- **Business risk:** Medium-High. If ISS-009/ISS-010's migration doesn't match the ACTUAL live schema (if schema drift exists and Phase 0's investigation was incomplete), the new migration could conflict with existing objects and fail to apply, or worse, silently create duplicate/shadow objects.
- **Technical risk:** Medium. Migrations in this codebase are consistently written with `IF NOT EXISTS`/idempotent patterns (see `005`-`010`), which reduces risk if the new migration follows the same convention.
- **Security risk:** The RLS fixes (ISS-007, ISS-008) reduce risk; the new-table migration (ISS-009) must include correct RLS policies from the start, not add them later, or it recreates the exact gap this whole audit found.
- **Deployment risk:** Medium. Migrations are harder to "undo" than application code once real data has been written against the new schema.
- **Data loss risk:** LOW IF the Phase 0 backup is taken and verified restorable first; otherwise MEDIUM-HIGH, since schema changes on a live database are the single riskiest operation in this entire roadmap.
- **Downtime risk:** Low-Medium (Postgres DDL on Supabase is generally fast for these table sizes, but any `ALTER TABLE` briefly locks the table).
- **Recovery strategy:** Never run untested migrations directly against production — apply to a staging/scratch Supabase project first (or a local Supabase instance) and rehearse both the migration AND its rollback before touching production. This is the one phase where the "test the rollback, not just the fix" discipline from Phase 0 is non-negotiable.

## Phase 4 — Infrastructure Cleanup

- **Business risk:** Low.
- **Technical risk:** Low-Medium. Deleting the wrong Tailwind config (ISS-032) could cause a visible styling regression if the assumption about which file is "active" is wrong.
- **Security risk:** Low.
- **Deployment risk:** Low.
- **Data loss risk:** Low, except ISS-023 (deleting the full `BOOKMYSPACES_BACKUP/` copy) — treat this as a one-way door and get explicit user sign-off first, exactly as the register specifies.
- **Downtime risk:** None.
- **Recovery strategy:** Everything in this phase is a `git revert` away except ISS-023, which should be preceded by an explicit off-repo backup of `BOOKMYSPACES_BACKUP/` if there's any doubt.

## Phase 5 — Business Logic

- **Business risk:** Medium. Wiring in previously-dead automation (escalation, follow-ups, daily summary) changes real operational behavior — e.g., customers may start receiving automated messages that weren't being sent before. This needs product sign-off on the exact triggers/content, not just a code fix.
- **Technical risk:** Medium. The ISS-018 reconciliation (follow-up module vs. existing cron logic) carries real risk of double-sending or conflicting follow-up messages if not done carefully.
- **Security risk:** Low, except that ISS-005 (zod validation rollout) touches all 31 routes and could reject previously-accepted-but-malformed data that some part of the frontend was silently relying on.
- **Deployment risk:** Medium.
- **Data loss risk:** Low.
- **Downtime risk:** Low.
- **Recovery strategy:** Ship each module's wiring independently and behind a manual trigger first (e.g., an admin-only "run now" button) before enabling full automation, so behavior can be observed before it runs unattended.

## Phase 6 — Integrations

- **Business risk:** Low-Medium. A real email provider (ISS-041) is a new external dependency with its own cost/rate-limit/deliverability considerations that didn't exist before.
- **Technical risk:** Low.
- **Security risk:** Low, provided the new email provider's API key follows the same env-var handling discipline as the rest of the app (reinforces the need for ISS-036's centralization).
- **Deployment risk:** Low.
- **Data loss risk:** None.
- **Downtime risk:** None.
- **Recovery strategy:** Keep the `mailto:` fallback available; if the new provider fails or is misconfigured, the feature degrades to its current behavior rather than breaking entirely.

## Phase 7 — UI

- **Business risk:** Negligible.
- **Technical risk:** Negligible.
- **Security/Deployment/Data-loss/Downtime risk:** None.
- **Recovery strategy:** Single-file revert.

## Phase 8 — Performance & Code Quality

- **Business risk:** Low, except ISS-030 (dashboard refactor) and ISS-034 (CSP headers), both called out below.
- **Technical risk:** Medium for ISS-030 specifically (932-line component refactor) — everything else in this phase is low-risk, mechanical work.
- **Security risk:** ISS-034 (CSP) carries a real risk of silently breaking functionality (blocked inline scripts, blocked font loads, blocked third-party chat-widget resources) if not tested thoroughly against every page.
- **Deployment risk:** Low, except CSP rollout, which should ideally ship in report-only mode first (`Content-Security-Policy-Report-Only`) to observe violations before enforcing.
- **Data loss risk:** None.
- **Downtime risk:** None.
- **Recovery strategy:** ISS-030: extract one sub-component at a time with a visual diff at each step, never all 16 at once. ISS-034: ship report-only first, then enforce.

## Phase 9 — Testing

- **Business risk:** None (adds coverage, doesn't change behavior).
- **Technical risk:** Low.
- **Security/Deployment/Data-loss/Downtime risk:** None.
- **Recovery strategy:** N/A.

## Phase 10 — Production Readiness

- **Business risk:** Low.
- **Technical risk:** Low-Medium — a startup validation check that's too strict could prevent the app from booting in a legitimate configuration that wasn't anticipated.
- **Security risk:** Low.
- **Deployment risk:** Medium — this is the phase where the full, cumulative set of changes from Phases 1-9 gets its final sign-off before being considered "production ready"; risk here is really the cumulative risk of everything before it, surfaced at once if a full regression pass hasn't been run continuously through prior phases (see `TEST_PLAN.md`'s note on running the regression checklist after every phase, not just at the end).
- **Data loss/Downtime risk:** Low if Phases 0-9 were executed with their own recovery strategies intact.
- **Recovery strategy:** The Phase 0 backup/branch point remains the ultimate fallback for the entire roadmap, not just Phase 0 — every phase should be able to trace back to "if this all goes wrong, here is the exact point we return to."

## Overall highest-risk items across the whole roadmap

1. **Phase 2 (Authentication)** — highest combined business + technical + downtime risk in the roadmap; a mistake here can lock out real users or fail open and expose data.
2. **Phase 3 (Database)** — highest data-loss risk; the only phase where an untested change could be genuinely hard to undo.
3. **ISS-006's architectural decision** — everything in Phase 2 and much of Phase 3 depends on this being made deliberately, not defaulted into under time pressure.
