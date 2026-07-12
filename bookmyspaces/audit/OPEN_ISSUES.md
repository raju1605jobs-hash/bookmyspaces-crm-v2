# OPEN_ISSUES.md

Remaining unresolved issues from `MASTER_ISSUE_REGISTER.csv`. See `COMPLETED_ISSUES.md` for the 14 issues done so far (ISS-040, ISS-031, ISS-025, ISS-042, ISS-047, ISS-020, ISS-019, ISS-032, ISS-001, ISS-003, ISS-004, ISS-033, ISS-002 batches 1-3, ISS-027, ISS-028, ISS-017 — note several share one fix, so 17 distinct completions covering 20 issue IDs). 32 of 52 open.

## Investigated, fix confirmed safe, deletion blocked by sandbox permissions (3)

These need nothing but a `rm` — confirmed safe by direct inspection, but this sandbox's mounted filesystem returns `Operation not permitted` for file/directory deletion. Please run these directly:

| Issue | Sev | Title | Exact action confirmed safe |
|---|---|---|---|
| ISS-013 | Low | Duplicate `007_missing_tables.sql` outside `supabase/migrations/` | `rm C:\rajubmp\007_missing_tables.sql` — confirmed byte-identical (`diff`) to `bookmyspaces/supabase/migrations/007_missing_tables.sql` |
| ISS-021 | Low | Empty brace-glob/stray directories clutter `src/app/api` | Delete the 4 literal `{...}`-named directories under `src/app/api` and the empty `src/app/api/webhook/` — confirmed empty |
| ISS-022 | Low | Stray backup archive inside a live API route folder | `rm "src/app/api/proposals/[id]/invoice/files.zip"` — contents reviewed (whatsapp.ts/queue.ts/templates.ts/webhook-route.ts, all older/superseded versions, e.g. `META_API_VERSION 'v17.0'` vs the live `'v23.0'` — confirmed no unmerged work) |

## Ready (14) — no blocker, can be implemented when its phase is reached

| Issue | Sev | Phase | Title |
|---|---|---|---|
| ISS-005 | High | Phase 5 | No input validation (zod) on any of the 31 API routes |
| ISS-007 | High | Phase 3 | Superseded — `notification_settings` doesn't exist live; live `notifications` table is already correctly RLS-scoped (see DATABASE_RECONCILIATION.md) |
| ISS-008 | High | Phase 3 | Superseded — already fixed in production; migration files just need to be updated to match (drop the stale anon policy statements) |
| ISS-011 | Medium | Phase 0 | ~~Migration 009 missing~~ — ✅ resolved, see DATABASE_RECONCILIATION.md (documenting migration fills the slot) |
| ISS-016 | High | Phase 5 | `src/lib/ai-summary.ts` fully implemented but unreachable — **caution:** its target table `ai_summaries` is defined in migrations but NOT live (Category B, SCHEMA_DRIFT_REPORT.md) — do not wire until that's resolved, or it will error in production |
| ISS-026 | Medium | Phase 4 | Two conflicting `middleware.ts` files — superseded, ISS-001's rewrite replaced the only live `middleware.ts`; confirm no second copy remains before closing |
| ISS-029 | Low | Phase 8 | ADMIN_EMAIL / ADMIN_PASSWORD declared but unused |
| ISS-034 | Medium | Phase 8 | No security headers (CSP, X-Frame-Options, etc.) |
| ISS-036 | High | Phase 8 | No centralized env var configuration or startup validation |
| ISS-037 | High | Phase 8 | .env.example names don't match what code actually reads |
| ISS-038 | Low | Phase 8 | Five declared env vars completely unused |
| ISS-041 | High | Phase 6 | Proposal 'email' feature returns a `mailto:` link, doesn't send email — **needs a real SMTP/transactional email provider (SendGrid/Resend/SES) API key, an external credential this sandbox does not have** |
| ISS-050 | High | Phase 10 | No one-click install / setup wizard / startup env validation |

## Blocked (8) — require a decision or external access before work can start

| Issue | Sev | Phase | Title | Blocked on |
|---|---|---|---|---|
| ISS-006 | High | Phase 3 | 28/31 routes use service-role client, bypassing RLS | Decision made (hybrid); implementation needs migration 009 applied live first (2 tables have RLS-on-zero-policies until then) |
| ISS-009 | Critical | Phase 3 | 5+ tables/views used live but not in any migration | Superseded/resolved by DATABASE_RECONCILIATION.md — awaiting user to run migration 009 live |
| ISS-010 | Critical | Phase 3 | leads.lead_stage used in code, never migrated | Confirmed live already (no code blocker); migration 009 documents it — awaiting user to run it live |
| ISS-015 | High | Phase 5 | Secondary WhatsApp subsystem, zero importers | Re-scoped Large→Medium (target tables already exist live) — awaiting migration 009 applied + careful state-value reconciliation |
| ISS-018 | High | Phase 5 | followup-engine.ts / followup-rules.ts, zero importers | Needs `follow_ups.trigger_reason` column from migration 009 |
| ISS-023 | Low | Phase 4 | Full duplicate project copy (BOOKMYSPACES_BACKUP) committed | User sign-off received: leave untouched, no action |
| ISS-043 | Medium | Phase 5 | Two non-shared implementations of same Meta Graph API call | Resolved as part of ISS-015 |
| ISS-049 | Medium | Phase 0 | Missing tables/column: live schema drift vs. broken feature? | ✅ Resolved — confirmed schema drift, not broken features; see SCHEMA_DRIFT_REPORT.md |

## Deferred (13) — optional / non-blocking, scheduled for later or opportunistic cleanup

| Issue | Sev | Phase | Title |
|---|---|---|---|
| ISS-012 | Low | Phase 3 | leads_needing_followup view — moot, doesn't exist live at all under any of its 3 definitions |
| ISS-014 | Low | Phase 5 | Hardcoded phone number in migration seed data |
| ISS-024 | Low | Phase 4 | Eight historical one-off helper scripts at project root |
| ISS-030 | Medium | Phase 8 | HotLeadDashboard.tsx: 932-line God Component, 16 inline sub-components |
| ISS-035 | Medium | Phase 8 | 77 explicit escapes from TypeScript strict mode |
| ISS-039 | Low | Phase 8 | 89 console.* calls left in production code paths |
| ISS-044 | Medium | Phase 8 | Business phone/pricing hardcoded across 6+ library files |
| ISS-045 | Low | Phase 8 | proposal-pdf.ts fetches Google Fonts live at render time |
| ISS-046 | Low | Phase 8 | CookieItem interface defined independently in two files |
| ISS-048 | Low | Phase 9 | Unverified whether any page renders mock data instead of live |
| ISS-051 | Low | Phase 8 | Blanket no-store cache header, no differentiated strategy |
| ISS-052 | Low | Phase 9 | Two page.tsx files outside audited scope, not evaluated |

**Total open: 32 (3 investigated/deletion-blocked, 13 Ready, 8 Blocked, 12 Deferred, one item — ISS-026 — pending a quick confirmation-only check). Completed: 20 issue IDs across 17 fixes (see COMPLETED_ISSUES.md).**

## Immediate next action

Two genuine external-input stop conditions remain, per the mission's own rules:
1. **Migration 009** needs the user to run it in the Supabase SQL Editor (no live DB write path from this sandbox).
2. **Git history push** needs the user's own GitHub credentials (no push auth available in this sandbox).

Phase 2 authentication (ISS-001/002/003/004/033) and the OAuth callback consolidation (ISS-027/028) and escalation engine wiring (ISS-017) are now all complete — see COMPLETED_ISSUES.md and CURRENT_STATUS.md. Manual click-through verification of login/logout/redirect flows against a live Supabase instance is still recommended before deploying, since this sandbox has no network path to Supabase.

---

## 2026-07-12 session update

Resolved this session (see COMPLETED_ISSUES.md and IMPLEMENTATION_LOG.md for full detail): ISS-026, ISS-029, ISS-034 (confirmed already done), ISS-036, ISS-050, ISS-037 (remaining gap only), ISS-038, ISS-008, ISS-005 (partial — 3 of 31 routes).

New finding, not a numbered issue yet: Kanban board and Dashboard tracked lead pipeline stage via two different, unsynced DB columns (`status` vs `lead_stage`) — fixed, see IMPLEMENTATION_LOG.md.

Security gap surfaced by the ISS-038 cleanup: `CRON_SECRET` and `WHATSAPP_APP_SECRET` are both correctly read by live code but were missing from `.env.local` — both routes fail open (unauthenticated) when their secret is unset, by design, so this is a real exposure right now, not a bug. `CRON_SECRET` generated and added to `.env.local`; still needs to be set in Vercel's environment variables to protect the deployed cron endpoints. `WHATSAPP_APP_SECRET` cannot be generated — must be the real value from the Meta for Developers dashboard.

Anomaly flagged, unresolved: this working copy has no `.git` directory at all, despite CURRENT_STATUS.md describing a branch/tags/history-rewrite that should exist here. Needs the user's attention directly — not something to guess at from within a sandbox.

**Remaining Ready items, unchanged:** ISS-041 (blocked on external SMTP — actually already resolved per COMPLETED_ISSUES.md row 26, this line is stale and should be removed on a future pass).

**ISS-005 follow-up:** the zod validation pattern (`src/lib/validation.ts`) is established and unit-tested; extending it to the remaining ~28 routes is now mechanical — each route needs a schema for its actual body shape, defined by whoever can verify that shape against real usage (ideally with live testing available, not blind from a sandbox).
