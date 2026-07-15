# BookMySpaces V3 — Production Deployment Sequence

Exact, ordered, no-assumptions sequence for taking this repository live. Each step names the exact command or action and what "done" looks like. Full context/rationale for each step lives in `PRODUCTION_DEPLOYMENT_GUIDE.md` and `DEPLOYMENT_RUNBOOK.md` — this document is the checklist to execute against, not the explanation.

## Pre-Sequence Decisions (resolve before starting)

- [ ] **Campaigns scope decided**: apply migration 004, or hide the Campaigns nav link (`PRODUCTION_READINESS_REVIEW.md` H1).
- [ ] **`WHATSAPP_APP_SECRET` obtained** from Meta for Developers dashboard (`PRODUCTION_READINESS_REVIEW.md` C2).
- [ ] **Every env var confirmed set in Vercel's Project Settings**, not just `.env.local` (`INFRASTRUCTURE_VALIDATION.md`).

## Sequence

1. **Backup the database.** `pg_dump "$DATABASE_URL" -f "pre-launch-backup-$(date +%Y%m%d).sql"`, stored outside the Supabase project itself. Confirm Supabase's own automated-backup plan tier is active. (`BACKUP_AND_RESTORE.md`)

2. **Apply migrations 012 + 013.** `DATABASE_URL="..." npm run db:migrate:v3`. Expected output ends: `✅ Migrations 012 and 013 applied successfully.` Do not proceed if this fails — fix the specific reported error and re-run the same command (both files are idempotent).

3. **Apply migration 004** (only if in scope per the pre-sequence decision). `psql "$DATABASE_URL" -f supabase/migrations/004_phase4_campaigns.sql`. Expected: standard Postgres `CREATE TABLE`/`INSERT` confirmations, no errors.

4. **Smoke test 012/013.** `DATABASE_URL="..." npm run db:smoke-test:v3`. Expected: `✅ All N checks passed.` If any check fails, stop — investigate the specific named check before proceeding to application deployment. Do not deploy application code on top of a failed migration smoke test.

5. **Smoke test 004** (only if applied). Manual SQL per `PRODUCTION_DEPLOYMENT_GUIDE.md` §7: confirm `festival_calendar` has 18 rows, `leads.is_vip`/`lifetime_value` columns don't error on select.

6. **Confirm `npm run build` completes locally**, on a real machine — this has never been verified from any engineering sandbox across this project's history (`PRODUCTION_READINESS_REVIEW.md` H2). Do not skip this step assuming it's fine.

7. **Deploy to Vercel.** Push/merge the branch Vercel deploys from; watch the build log to completion, don't assume success from the trigger alone.

8. **Verify Health API.** `GET /api/health` returns 200.

9. **Verify database connectivity end-to-end.** Load `/customers`, confirm it shows real data — this route doesn't depend on migration 012 at all, so it's the fastest true "talking to the right database" signal.

10. **Verify the Reservation Platform.** Load `/reservations` — should show real stats (not all-zero/degraded) now that 012/013 are live. Create one throwaway test reservation to confirm the availability-check and creation path work end-to-end against real Postgres, not just the smoke test's transactional simulation.

11. **Verify WhatsApp.** Send a real WhatsApp message to the business number, confirm it appears in the CRM within a few seconds (tests both receiving and the webhook's now-enforced signature verification). Send one outbound message from the app, confirm delivery.

12. **Verify AI.** Open a Customer Profile, trigger the AI Assistant (Customer Summary or Suggested Reply), confirm a real response comes back (not an error state) — confirms both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are valid in the deployed environment, not just present in `.env.local`.

13. **Verify Payments.** Record a real (or clearly-marked test) payment against a proposal, confirm the invoice's balance updates correctly and — specifically — confirm the proposal's `accepted_at` is set if its status is `accepted` (this session's predecessor found and fixed a real bug here; this is the live confirmation that fix holds).

14. **Verify Dashboards.** Load both Operations and Revenue dashboards, confirm the numbers from steps 10 and 13 actually appear (Bookings KPI reflects the test reservation, Revenue reflects the test payment) — this is the live confirmation of the `bookings→reservations` fix and the `accepted_at` fix together.

15. **Verify Campaigns** (only if migration 004 was applied). Load `/campaigns`, confirm the list loads without a 500.

16. **Begin UAT.** Run the full `UAT_OPERATOR_CHECKLIST.md` (this session's Phase 5 deliverable) — steps 8–15 above are a fast smoke pass, not a substitute for the complete 16-scenario UAT.

## If Any Step Fails

Stop at that step. Do not proceed to later steps hoping they'll reveal more context — fix or explicitly accept the specific failure first. `DEPLOYMENT_RUNBOOK.md`'s Incident Response section and `DISASTER_RECOVERY_PLAN.md`'s scenario list cover what to do for each class of failure.
