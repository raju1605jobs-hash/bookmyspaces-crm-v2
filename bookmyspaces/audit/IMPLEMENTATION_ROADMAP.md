# IMPLEMENTATION_ROADMAP.md

Master overview document. This is planning only — nothing described here has been implemented. It converts the 18-file read-only audit in this same folder into a structured, phased engineering plan.

## How the planning documents fit together

| Document | Purpose |
|---|---|
| `MASTER_ISSUE_REGISTER.csv` | Source of truth — all 52 issues with full structured fields |
| `MASTER_ISSUE_REGISTER.md` | Readable, grouped view of the same 52 issues |
| `DEPENDENCY_GRAPH.md` | What blocks what, what can run in parallel |
| `IMPLEMENTATION_PHASES.md` | Phase 0-10 objectives, tasks, deliverables, exit criteria, hours |
| `IMPLEMENTATION_ORDER.md` | Exact 1-53 step sequencing with prerequisites and rollback per step |
| `RISK_REGISTER.md` | Business/technical/security/deployment/data-loss/downtime risk per phase |
| `TEST_PLAN.md` | Test types required per issue, plus detailed critical-path scenarios |
| `PRODUCTION_SCORECARD.md` | 0-10 scores per area, evidence-referenced |
| `EXECUTIVE_SUMMARY.md` | Answers to the 8 leadership-level questions |
| `NEXT_STEPS.md` | What to do literally next, including decisions only you can make |
| `ROADMAP.json` | Machine-readable rollup of all of the above |

## Scope note

This roadmap is built strictly from the 18 files inside `C:\rajubmp\bookmyspaces\audit\` (the second, stricter read-only audit round: `PROJECT_DISCOVERY.md` through `summary.json`). It does not re-import findings from the earlier, less rigorously-cited first audit pass (the original `BOOKMYSPACES_PROJECT_AUDIT.md`/`FEATURE_MATRIX.md`/`BUG_REPORT.md` produced before this audit folder existed) except where those findings are independently re-confirmed inside this audit folder. If anything from that earlier pass still matters (for example, the earlier pass flagged possible committed customer PII in `latest.json`/`logs.json` — this roadmap's ISS-025 captures that these files exist and need content review, but does not re-assert the earlier pass's specific PII claim as independently verified in this stricter round), treat it as a prompt to re-verify, not as settled fact.

## Success criteria by phase (Step 9)

**Phase 0 — Backup, Branching, Investigation**
- ✓ Git branch created and pushed; database backup taken and restore-tested
- ✓ ISS-011 (migration 009 gap) has a documented answer
- ✓ ISS-049 (live-DB schema check) has resolved ISS-009 and ISS-010's root cause
- ✓ ISS-025 (stray files) classified as routine cleanup or security incident

**Phase 1 — Critical Security**
- ✓ No payment/invoice data appears in server logs
- ✓ `npm test` runs and exits 0 (even on a placeholder test)

**Phase 2 — Authentication**
- ✓ Middleware protects all private routes (logged-out access to any `(crm)`/`admin`/`analytics` page redirects to login)
- ✓ Every API route either validates the session or is on a documented, deliberate public allowlist
- ✓ Role checks are verified correct (admin sees admin data, non-admin gets 403)
- ✓ Anonymous access to protected data is removed; anonymous access to intentionally-public flows (chat widget, proposal share links) still works
- ✓ WhatsApp webhook rejects unsigned/forged payloads
- ✓ Only one OAuth callback implementation remains, with a working failure redirect

**Phase 3 — Database**
- ✓ Schema matches application code (all 5 previously-missing tables/views and the `lead_stage` column exist and are queryable)
- ✓ All migrations verified idempotent and re-runnable
- ✓ RLS enabled on every table that holds non-public data, including `notification_settings`
- ✓ No anon-writable policy without row-level scoping

**Phase 4 — Infrastructure Cleanup**
- ✓ No misnamed/unreachable route files remain
- ✓ No empty/stray directories or archive files in `src/app/api`
- ✓ Exactly one active Tailwind config file
- ✓ Exactly one active `middleware.ts`

**Phase 5 — Business Logic**
- ✓ Every file in `src/modules/` and `src/lib/` is reachable from a live code path, or has been deliberately deleted
- ✓ All 31 routes validate input with zod
- ✓ Daily AI summary, escalation engine, and follow-up cadence all run automatically as designed

**Phase 6 — Integrations**
- ✓ Proposal emails are delivered via a real provider, not just returned as a `mailto:` link
- ✓ WhatsApp auto-reply pricing matches the live `packages` table

**Phase 7 — UI**
- ✓ Zero broken redirect targets

**Phase 8 — Performance & Code Quality**
- ✓ Centralized, documented environment configuration with startup validation
- ✓ Baseline security headers deployed (CSP in enforce mode, tested)
- ✓ `HotLeadDashboard.tsx` reduced to a reasonable size with extracted, independently-testable sub-components (target: no single file over ~300 LOC in this area)

**Phase 9 — Testing**
- ✓ Automated coverage exists for login, lead capture, proposal lifecycle, payment recording, WhatsApp send
- ✓ Manual QA pass completed on every page including the 2 previously out-of-scope ones

**Phase 10 — Production Readiness**
- ✓ A fresh clone, following only written setup docs, results in a working app
- ✓ Zero Critical or High severity issues remain open in `MASTER_ISSUE_REGISTER.csv`
- ✓ Documented, rehearsed rollback procedure exists for future changes

## Total estimated effort

**~200–355 hours** (5–9 weeks, one engineer; 2.5–4.5 weeks, two engineers working the dependency graph's parallel tracks). See `EXECUTIVE_SUMMARY.md` for the priority-tier breakdown.

## What this roadmap deliberately does NOT do

Per the mission constraints for this task: no code has been written, no files outside `audit/` have been modified, no SQL has been written, and no application behavior has changed. Phase 0 is the first phase that touches anything outside this planning folder, and even that is limited to backup/branch creation and read-only investigation.
