# BookMySpaces V3 — Deployment Runbook

Operational companion to `PRODUCTION_DEPLOYMENT_GUIDE.md` (which has the full command reference) — this document is written for "it's deploy day / something just broke," not first-time setup.

## Environment Variables

Full reference and current set/missing status: `PRODUCTION_DEPLOYMENT_GUIDE.md` §2. The two items that matter most operationally: `WHATSAPP_APP_SECRET` (unset — webhook signature checks are not enforced without it) and confirming every variable set in `.env.local` is *also* set in Vercel's Project Settings before deploying — `.env.local` never ships.

## Deployment Steps (routine release)

1. Confirm `tsc --noEmit`, `eslint src`, `vitest run` are all clean on the branch you're deploying (CI should enforce this, but verify manually if deploying outside normal CI).
2. Confirm `npm run build` completes locally — this is the one check that has never been verified from an engineering sandbox session across this project's history; don't skip it assuming it's fine.
3. Push/merge to the branch Vercel deploys from. Vercel builds and deploys automatically if already connected.
4. Watch the Vercel build log to completion — don't assume success from the deploy triggering.
5. Run the health checks below against the new deployment before considering it live.

## Migration Order

012 → 013 (one command, `npm run db:migrate:v3`), then 004 if in scope for this release (separate manual `psql`/SQL-Editor run — see `PRODUCTION_DEPLOYMENT_GUIDE.md` §3a/§4b for the scope decision). Always run migrations *before* deploying application code that depends on their tables — this app tolerates a missing `reservations` table gracefully (degrades the Revenue Dashboard's Bookings KPI), but does not tolerate a missing `broadcast_campaigns` table gracefully (Campaigns 500s outright) — so if 004 is in scope, its migration must land before the deploy that assumes it.

## Rollback

**Application:** Vercel Dashboard → Deployments → select the previous known-good deployment → Promote to Production. Instant, no data risk, always the first lever to pull if something is badly wrong post-deploy.

**Database:** `npm run db:rollback:v3` (012+013) or `psql -f supabase/migrations/004_phase4_campaigns_ROLLBACK.sql` (004) — both destroy real data created after the migration, both documented in full in `PRODUCTION_DEPLOYMENT_GUIDE.md` §5. Application and database rollback are independent — don't reflexively do both; decide separately whether the database actually needs to move, since most application-level incidents don't require it.

## Health Checks

- `GET /api/health` returns 200.
- `/customers` loads and shows real data (doesn't depend on migration 012 — fastest true "talking to the right database" signal).
- `/reservations` loads without an error banner (will show all-zero stats if 012 isn't live yet — that's expected, not a failure, until 012 is applied).
- `/campaigns` loads without a 500 (only meaningful if migration 004 is in scope for this release).

## Monitoring

No dedicated APM/error-tracking tool is wired in as of this writing — `logger.error()` calls throughout the codebase go to Vercel's function logs, which is your primary signal today. Recommend adding a real error-tracking service (Sentry or equivalent) as near-term hardening — see `VERSION1_1_ROADMAP.md`. In the meantime: check Vercel's Function Logs (Vercel Dashboard → your project → Logs) after every deploy and periodically thereafter, filtering for `error` level.

## Recovery

For anything beyond "roll back the last deploy," see `DISASTER_RECOVERY_PLAN.md` for scenario-specific steps (database loss, credential compromise, extended outage).

## Incident Response

1. **Assess scope** — is this affecting all users, one feature, or one customer's data? Check `/api/health` and the specific broken page/flow first.
2. **Stop the bleeding** — if it started right after a deploy, roll back the application (above) before investigating root cause; you can always re-deploy the fix once found.
3. **Communicate** — tell Raju (Product Owner) what's affected and your rollback/fix ETA, even if the fix is fast; a live guest-facing hospitality system warrants that regardless of severity.
4. **Root-cause before re-deploying** — don't re-push the same code that just caused the incident without understanding why it failed; re-verify the full quality gate (tsc/eslint/tests/build) on the fix specifically.
5. **Write it down** — a short incident note (what broke, why, how it was fixed, what would have caught it sooner) is worth ten minutes even for a small incident; it's the raw material for actually improving monitoring and process over time.
