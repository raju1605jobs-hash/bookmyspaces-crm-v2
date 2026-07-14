# BookMySpaces V3 — Release Checklist

Last updated: this session (V1 Release Readiness pass), branch `feature/v3-omnichannel-platform`, HEAD `800326b`.

## Repository Health

- [x] Git status clean of tracked changes (only pre-existing, deletion-blocked cruft untracked — see Known Risks)
- [x] `git fsck` clean (only expected dangling objects from prior recovery operations, no corruption)
- [x] No stale `.git/*.lock` files blocking commits (cleared each session via `mv`, since `rm` is blocked on this mount)
- [ ] Repo-root cruft removed (6 stale `.git.*` backup dirs, 2 stray files) — **blocked, needs a direct `rm` on your machine**

## Migration Status

- [x] Migration 012 (`reservations`/`properties`/`inventory_items`/etc.) — file verified internally consistent, corruption from an early session repaired (RC2)
- [x] Migration 013 (`proposals` ↔ reservation-platform links) — verified consistent, correctly depends on 012 and pre-existing `packages` (migration 007)
- [x] `db:migrate:v3` / `db:rollback:v3` / `db:smoke-test:v3` scripts — syntax-checked (`node -c`), apply/rollback ordering confirmed correct
- [ ] **Migrations 012/013 actually applied to live Supabase — still blocked, no network egress from this sandbox (confirmed once again this session, proxy 403)**
- [ ] **Migration 004 (`broadcast_campaigns`, `festival_calendar`) and others in Schema Drift Category B — also never applied live.** Not previously called out as a release blocker in RC1-3; see Defects Found below.

## Build Status

- [x] `tsc --noEmit` — 0 errors
- [x] `eslint src` — 0 errors, 1 pre-existing warning (`no-img-element`)
- [x] `vitest run` — 23 files, 164 tests, all passing
- [ ] `next build` — cannot complete in this sandbox (confirmed: each shell call runs in an isolated process namespace, so even a backgrounded build doesn't survive between calls; not just a time-budget issue). **Run `npm run build` locally before the demo — this has never completed in any session to date.**

## TypeScript / ESLint / Tests

All three re-verified at the start of this session and after every code change. See Build Status above — no separate section needed, single source of truth.

## Business Workflow Validation

| Stage | Status |
|---|---|
| Customer Enquiry → Identity Resolution | Verified clean (RC1, re-confirmed this session by file read) |
| Customer Search → Customer Profile | Verified reachable; AI Assistant confirmed wired into Customer Profile page |
| Reservation → Availability → Pricing | Verified clean (`reservation-workflow.ts`, `reservation-service.ts`, `pricing-service.ts`) |
| Proposal → Proposal Conversion | Verified clean (`proposal-service.ts` correctly sets `reservation_id`) |
| Invoice | Verified clean — correctly reads live `invoices`/`payments` tables |
| Payment | **Defect found and fixed this session** — see below |
| Timeline | Verified clean (RC3) |
| Operations Dashboard | Verified clean — already correctly reads `reservations`, not the legacy `bookings` table |
| Revenue Dashboard | **Defect found and fixed in RC3** (bookings→reservations) and **again this session** (accepted_at) |
| AI Assistant | Verified wired into Customer Profile page, reachable from Customer Search |

## Deployment Readiness

- [x] Deployment scripts present and syntax-valid
- [x] Rollback scripts present, correctly ordered, warn about data loss
- [ ] Live migration run + smoke test — blocked on Supabase network access
- [ ] **Campaigns feature (nav-linked, code-complete) will fail at runtime until migration 004's tables are applied live** — new finding, not previously flagged as launch-blocking in RC1-3

## Known Risks

- This sandbox's file-write path has a reproducible truncation bug (confirmed independently in the Edit tool, the Write tool, and git's own index across RC2/RC3/this session) — every write in this session was independently verified with `wc -c`/`tail -c` before committing, and that discipline should continue in any future session on this mount.
- Repo-root cruft cannot be deleted from within this sandbox (`rm` returns `Operation not permitted` on every file tested, `mv` works) — needs manual cleanup on your machine.

## Remaining Blockers

1. **Live Supabase network access** — unblocks migration 012/013 AND migration 004 (Campaigns) application, plus real end-to-end testing.
2. **User Acceptance Testing** — no live-data click-through has been possible from any sandbox session to date.
3. **Production deployment** — pending the above two.

## Go-Live Tasks (for you, outside this sandbox)

1. Run `npm run db:migrate:v3` then `npm run db:smoke-test:v3` from a machine with real Supabase access.
2. **Also apply migration 004 (`004_phase4_campaigns.sql`) and check the other Category-B tables in `audit/SCHEMA_DRIFT_REPORT.md`** if Campaigns is meant to be part of the V1 launch — otherwise, consider hiding the Campaigns nav link until it is, since right now it's a dead end for an operator.
3. Run `npm run build` locally and confirm it completes.
4. Manually click-test the full workflow once against live data.
5. Delete the repo-root cruft listed above.
6. Set `WHATSAPP_APP_SECRET` (still not obtainable in-sandbox — needs the Meta for Developers dashboard) if not already done in a prior session.
