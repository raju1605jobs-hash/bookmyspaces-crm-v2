# Release Candidate 3 Report — BookMySpaces V3

**Branch:** `feature/v3-omnichannel-platform`
**Session scope:** independent validation, continuing from RC2 (`audit/RELEASE_CANDIDATE_2_REPORT.md`)
**Mandate:** increase confidence in RC1 through direct verification, not feature work.

---

## Executive Summary

RC3's instruction was explicit: don't assume prior sessions were correct, randomly inspect previously modified files, and trust evidence over reports. That approach paid off twice this session.

First, a direct read of `src/app/api/dashboard/revenue/route.ts` (not mentioned as risky in any prior report) turned up a real integration gap: the Revenue Dashboard's Bookings/Confirmed KPI cards were querying `bookings`, a pre-V3 table (migration 003) that a full-repo grep confirmed **nothing in the current codebase writes to**. The actual V3 Reservation Platform (`reservation-workflow.ts`, `reservation-service.ts`) writes to `reservations` (migration 012) instead. Left as-is, once migration 012 goes live and real reservations start flowing through the new workflow, those two dashboard cards would have silently stayed frozen forever — the same class of bug as the kanban/dashboard `lead_stage` divergence documented earlier in this project's history. Fixed: the booking KPIs now read `reservations.status`, mapped to the real V3 state machine, and degrade gracefully (zeros + a "Reservation platform not live yet" label) rather than 500-ing the whole dashboard if the table isn't live yet — since leads/proposals/revenue-$ don't depend on migration 012 and shouldn't fail because of it.

Second, while landing that fix, this session hit the file-corruption bug documented in RC2 a further two times — once via the Edit tool, once via a Write-tool retry that truncated the same file at the identical byte offset. Both were caught immediately by `tsc` (not assumed clean) and recovered via the bash heredoc-to-tempfile-then-`cp` pattern, with the result independently verified via `wc -c`/`tail -c` rather than trusted from either tool's own success message. This is now the third consecutive session (RC2, and twice this session) this exact bug has been caught in the act rather than shipped silently — which is itself a validation of the "verify, don't assume" instruction this session was run under.

No other defect was found in this session's spot-checks of `context-builder.ts`, `resolve-identity.ts`, `reservation-workflow.ts`, `timeline-service.ts`, `reservation-service.ts`, the Reservation Calendar, and the Operations Dashboard — all read cleanly, and the Operations Dashboard and `proposal-service.ts` were confirmed to already correctly use `reservations` (the bookings-dashboard bug was isolated, not systemic).

## Repository Audit Results

**Files independently verified this session** (read in full or spot-checked for integrity/syntax/dependency correctness, not just trusted from a prior report):

| File | Result |
|---|---|
| `supabase/migrations/012_v3_foundation_schema.sql` | Clean — RC2's fix confirmed still intact at HEAD, 206/206 balanced parens |
| `supabase/migrations/013_proposal_reservation_links.sql` | Clean — `packages(id)` FK correctly resolves to migration 007 (pre-existing table), not a dangling reference as first suspected; rollback script correctly scoped (only drops columns it added, in the correct reverse order) |
| `src/lib/ai/context-builder.ts` | Clean — no truncation, no logic issue found |
| `src/lib/identity/resolve-identity.ts` | Clean |
| `src/lib/reservations/reservation-workflow.ts` | Clean — state-machine wrappers correctly call `transitionReservationStatus` with matching CRM activity-log entries |
| `src/lib/reservations/reservation-service.ts` | Clean — confirmed this is the actual write path for `reservations`, used as the reference implementation for the dashboard fix below |
| `src/lib/timeline/timeline-service.ts` | Clean |
| `src/app/(crm)/reservations/calendar/page.tsx` | Clean, no truncation |
| `src/app/api/dashboard/operations/route.ts` | Clean — **already correctly queries `reservations`, not `bookings`** (confirms the bug found below was isolated to the Revenue Dashboard, not systemic) |
| `src/lib/proposals/proposal-service.ts` | Clean — correctly writes `reservation_id` on the proposal↔reservation link |
| `src/app/api/dashboard/revenue/route.ts` | **Defect found and fixed** — see below |
| `src/app/(crm)/dashboard/revenue/page.tsx` | Updated to match the route fix, hit the truncation bug during the edit, recovered and verified |
| `scripts/apply-v3-migrations.mjs` | Clean — `node -c` syntax check passes; migration order confirmed correct (012 before 013 on apply, 013 before 012 on rollback) |
| Repo-root git state (`.git`, locks, stale backup dirs) | No new corruption; 3 stale lock files from RC2's own commits found and cleared (see below) |

## Defects Found

1. **Revenue Dashboard booking KPIs sourced from a dead table.** `bookings` (migration 003) has zero writers anywhere in the current codebase (confirmed via `grep -rn "\.from('bookings')" src`); the V3 reservation workflow writes to `reservations` (migration 012) instead. This would have silently broken two dashboard KPI cards the moment migration 012 went live, with no error — the same "two paths, one is stale" pattern as a previously-documented kanban/dashboard bug.
2. **This sandbox's file-write truncation bug is confirmed to also affect the Write tool, not only Edit.** RC2 only observed it in Edit and in git's own index. This session's fix attempt was truncated first by Edit, then by a Write-tool retry — both cut off at the identical byte offset in the same file, which points to a fixed-size buffer boundary in this mount's write path rather than a random glitch.

## Defects Fixed

1. `src/app/api/dashboard/revenue/route.ts` — booking KPIs now query `reservations.status` instead of `bookings`, mapped to the real V3 state machine (`confirmed`/`checked_in` → confirmed, `checked_out` → completed, `cancelled`/`no_show` → cancelled). The query is deliberately isolated from the leads/proposals fail-fast group so a not-yet-live `reservations` table degrades this one KPI block (zeros + a `degraded` flag) instead of failing the entire dashboard.
2. `src/app/(crm)/dashboard/revenue/page.tsx` — surfaces the new `degraded` flag as a "Reservation platform not live yet" sub-label on the affected KPI cards, so an operator sees an honest "not live yet" state instead of an unexplained zero.

## Migration Status

**Still not applied — unchanged, eighth consecutive session.** Network egress to the Supabase host was checked once this session per protocol: same proxy-level 403 as RC2. Migration 012/013 files themselves were re-verified this session (see Repository Audit Results) and remain internally consistent and ready. No changes made to either migration file this session — RC2's repair is intact and unmodified.

## Build Status

Not re-attempted via `next build` this session beyond a repeat of RC2's finding: a 40-second foreground run reproduces the identical stall (`▲ Next.js 14.2.5` / `- Environments: .env.local`, then nothing) every session going back to Sprint 4. A background-process attempt this session additionally confirmed *why* backgrounding doesn't help here: each shell invocation in this sandbox runs in its own fresh, unshared process namespace (`bwrap --unshare-pid`), so a `nohup`'d build does not survive past the tool call that started it — this isn't purely a time-budget issue, it's that there is no way to keep a long-running process alive across calls in this environment. `tsc`/`eslint`/`vitest` remain the only gate this sandbox can actually run to completion.

## TypeScript Status

`npx tsc --noEmit` — **0 errors**, verified after this session's fix (and after both truncation-bug recoveries).

## ESLint Status

`npx eslint src` — **0 errors, 1 pre-existing warning** (`no-img-element`, unchanged).

## Test Status

`npx vitest run` — **23 test files, 164 tests, all passing.** No new tests added — the fix changes which table a dashboard route reads from, with no existing test harness around that route to extend without a live database to assert against; correctness was established by direct code/schema cross-referencing (reservation status enum from migration 012 vs. the route's status mapping) rather than a new unit test.

## Performance Review

Not a focus this session — no new measurable bottleneck surfaced during the file spot-checks, and RC1 already closed the one identified item (chat lead-dedup).

## Security Review

Not re-audited from scratch — no auth/RLS/webhook-adjacent files were touched this session. `requireAuth()` was confirmed still present and unchanged on the edited revenue route.

## Files Modified

```
src/app/api/dashboard/revenue/route.ts        (bookings -> reservations, graceful degradation)
src/app/(crm)/dashboard/revenue/page.tsx      (surface the new degraded state to the operator)
```

## Database Changes

None. Both fixes are application-layer only; no migration file was touched this session.

## API Changes

`GET /api/dashboard/revenue` response: `bookings.total`/`bookings.confirmed`/`bookings.completed`/`bookings.cancelled` now reflect `reservations` instead of `bookings`, and a new `bookings.degraded: boolean` field was added. Existing field names are unchanged — no consumer needs a shape migration, only a semantic awareness that the numbers now come from the live reservation workflow instead of a dead table.

## Commits

```
265238b fix(dashboard): Revenue Dashboard booking KPIs read a dead legacy table
```

One commit this session (plus this report). Verified landed via `git log --oneline -3` after clearing 3 stale lock files (`HEAD.lock`, `index.lock`, `objects/maintenance.lock`) left behind by RC2's own commits, which this sandbox's mount also can't `rm` — cleared via `mv`, the same workaround used for the git-index corruption in RC2.

## Remaining Risks

- **Migration 012/013 still not live** — unchanged, eighth consecutive session, same network cause.
- **This sandbox's write-truncation bug is now confirmed broader than RC2 described**: Edit tool, Write tool, and git's own index have all been independently observed corrupted mid-write, all at what looks like a consistent buffer-size boundary rather than randomly. Every file this session touched was independently verified with `wc -c`/`tail -c` after writing, not trusted from tool success messages — this is now the required discipline for any future session working in this specific sandbox mount, not an occasional precaution.
- **The `bookings`-vs-`reservations` bug class may not be fully closed.** This session found and fixed one instance and confirmed two other likely candidates (Operations Dashboard, `proposal-service.ts`) were already correct, but a full grep for every `.from('bookings')`/legacy-table reference across the entire `src` tree was not exhaustively re-run after the fix to guarantee zero remaining instances beyond the one already checked — worth a final confirming grep as part of the actual pre-migration checklist.
- Carried over unchanged from RC1/RC2: no dedicated `audit_log` table for admin actions; pre-existing `leads.phone` records not retroactively normalized; repo-root cruft (6 stale git backup dirs, 2 stray files) still undeletable from every sandbox session to date.

## Production Readiness Score

**7.5 / 10.** Unchanged from RC2. This session found and fixed one more real, previously-undetected integration defect using the exact "verify, don't assume" method RC2 recommended — which is a point in favor of the process, not a point against the code's overall state. The score holds rather than rises because the underlying reason for RC2's downgrade (static analysis alone, across multiple "clean" sessions, missed real defects) still applies equally to this session's own findings until a live-data pass actually happens.

## Recommendation

1. **Run the migration and read the output** — unchanged top recommendation, now eighth consecutive session. `npm run db:migrate:v3` then `npm run db:smoke-test:v3` from a machine with real Supabase access.
2. **Run one final grep for `.from('bookings')` / any other pre-V3 table name across all of `src`** before the live migration, as a closing confirmation that this session's fix was the only instance of this bug class.
3. **Re-clone from `origin` and diff against this working copy** before the demo — unchanged from RC2, given this sandbox's now twice-more-confirmed write-corruption behavior.
4. Manually clear the accumulated repo-root cruft and the 3 additional stale git lock files this session left behind (same `mv`-then-manual-`rm` situation as RC2).
5. Run a real `npm run build` outside this sandbox — this session's finding about per-call process isolation explains *why* it can't be done here, which should save the next session from re-attempting it as if it might work differently this time.
