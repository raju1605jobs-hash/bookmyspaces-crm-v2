# BookMySpaces V3 — Production Deployment Guide

Branch: `feature/v3-omnichannel-platform`. This guide covers everything needed to take this repository from its current state (code-complete, migrations unapplied) to a live production deployment. Written for you (Raju) to run from a machine with real Supabase and Vercel access — none of this can be executed from the engineering sandbox these sessions have run in (no network egress to Supabase, confirmed repeatedly).

## 1. Prerequisites

- Node.js and `npm` (matching `package.json`'s engines — Next.js 14.2.5, React 18).
- A Supabase project (already exists — `nssteddtqgqubggpcwae.supabase.co`) with dashboard access.
- A Vercel project connected to this repository, or equivalent hosting that supports Next.js 14 App Router with server actions/route handlers.
- Access to the Meta for Developers dashboard for the WhatsApp Cloud API app (to obtain `WHATSAPP_APP_SECRET`, currently missing — see §2).
- A Resend account (already configured — `RESEND_API_KEY` is set) for outbound email.
- Run `npm install` locally at least once before any migration script — the migration/smoke-test/rollback scripts depend on the `pg` devDependency.

## 2. Environment Variables

Full reference: `.env.example` (in the repo root, kept current and annotated — treat it as the source of truth over this section if the two ever disagree). Status as of this session's check of `.env.local`:

**Set and ready:**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_ID`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BUSINESS_WHATSAPP`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.

**Missing — action needed before go-live:**
- `WHATSAPP_APP_SECRET` — get this from the Meta for Developers dashboard (Settings → Basic) for your WhatsApp Cloud API app. **Until this is set, the WhatsApp webhook (`src/app/api/whatsapp/webhook/route.ts`) accepts unsigned requests** — it logs a warning but does not reject them. This is a real, live security gap, not a nice-to-have, and should be closed before go-live.
- `WATI_BASE_URL` / `WATI_API_TOKEN` — legacy, only used by `/api/health` and a transcription helper; not required for core operation. Set only if you still rely on Wati for anything.

When deploying to Vercel, every variable above (except the `WATI_*` ones, if unused) needs to be set in Vercel's Project Settings → Environment Variables, not just in `.env.local` — `.env.local` is never deployed.

## 3. Migration Order

Three migrations are relevant to this go-live: **012, 013, and 004**. None has been applied to the live database yet (confirmed via this session's proxy-blocked connectivity check, consistent with every prior session). Apply in this order:

1. **012 → 013** via the existing one-command script (see §4). These two are coupled (013 adds FKs into tables 012 creates) and the script already enforces the correct order.
2. **004** (`004_phase4_campaigns.sql`) — independent of 012/013, but has its own prerequisite decision: see §3a.

### 3a. Migration 004 — a decision, not just a step

Migration 004 creates `broadcast_campaigns`, `ai_summaries`, `festival_calendar` (with 2026 seed data), `staff_performance`, and `notification_settings`, plus 5 additive columns on `leads` (`is_vip`, `vip_reason`, `lifetime_value`, `referral_source`, `repeat_customer`). The app's Campaigns feature (`/campaigns`, nav-linked) is fully built and depends on `broadcast_campaigns`/`festival_calendar` specifically — **without this migration applied, every Campaigns action will fail with a 500 in production** (`VERSION1_RELEASE_READINESS_REPORT.md` has the full finding).

Decide one of:
- **Apply 004 as part of this same go-live** (recommended if Campaigns should be usable at launch) — see §4b for the command.
- **Skip 004 for now and hide the Campaigns nav link** until you're ready to revisit it — a small, low-risk UI change, not covered by this guide since it's a scope decision, not a deployment step.

`ai_summaries` (unreachable dead code, per ISS-016) and `notification_settings` (superseded by the live `notifications` table) can be included or excluded from this decision without consequence either way — nothing in the current app breaks or benefits from their presence. `staff_performance` has no current app code reading or writing it either — applying it is harmless but not urgent.

## 4. Deployment Commands

### 4a. Migrations 012 + 013

```bash
cd bookmyspaces
npm install
DATABASE_URL="postgres://postgres:[password]@[host]:5432/postgres" npm run db:migrate:v3
```

Get the connection string from Supabase Dashboard → Project Settings → Database → Connection string → URI (direct or session-pooler both work). This runs `012_v3_foundation_schema.sql` then `013_proposal_reservation_links.sql`. Both are idempotent (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` throughout) — safe to re-run if it fails partway through; it will skip anything already created and pick up from the actual failure point.

**Expected output ends with:**
```
Verifying...
  properties: 2, inventory_items: 0, reservations: 0

✅ Migrations 012 and 013 applied successfully.
```

### 4b. Migration 004 (if you decided to apply it — see §3a)

This migration predates the `db:migrate:v3` script (which is scoped specifically to 012/013) and has always been intended to run the standard way: via `psql` or the Supabase SQL Editor, the same way migrations 001–003 and 005–011 were presumably already applied to get this project to its current live state.

```bash
psql "$DATABASE_URL" -f supabase/migrations/004_phase4_campaigns.sql
```

Or paste the file's contents into Supabase Dashboard → SQL Editor and run it there. It is additive and idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING` on both seed inserts) — safe to re-run.

**Expected result:** no output beyond Postgres's own `CREATE TABLE`/`ALTER TABLE`/`INSERT 0 N` confirmations (psql) or a green success banner (SQL Editor). There is no smoke test for migration 004 (see §6) — verify manually per §3a's table list, or spot-check the Campaigns page after deploying the app.

### 4c. Application deployment

Standard Vercel flow: push/merge this branch, Vercel builds and deploys automatically (assuming the project is already connected). **Run `npm run build` locally at least once before pushing**, to confirm the build actually completes — this has never been verified from any engineering sandbox session to date (see Known Risks in every RC report); Vercel's own build is the first real confirmation this repository has had.

## 5. Rollback

### 012 + 013
```bash
DATABASE_URL="postgres://..." npm run db:rollback:v3
```
Runs `013_proposal_reservation_links_ROLLBACK.sql` then `012_v3_foundation_schema_ROLLBACK.sql`, in that order. **This permanently deletes any reservations/properties/inventory data created after the migration** — take a fresh backup first if any real bookings exist.

### 004
No script — apply the new rollback file directly:
```bash
psql "$DATABASE_URL" -f supabase/migrations/004_phase4_campaigns_ROLLBACK.sql
```
This file was written during this go-live preparation session (004 never had one before). It drops `broadcast_campaigns`, `ai_summaries`, `festival_calendar`, `staff_performance`, `notification_settings`, and removes the 5 columns 004 added to `leads`. **This destroys any real campaign or staff-performance data created after 004 went live** — the seeded festival calendar and notification defaults are low-risk reference data, but take a backup first if there's any doubt.

### Application
Revert to the previous Vercel deployment (Vercel Dashboard → Deployments → previous → Promote to Production), independent of any database rollback.

## 6. Health Checks

- `GET /api/health` — existing endpoint; confirms the app boots and can reach Supabase/Wati (if configured).
- After deploying, confirm `NEXT_PUBLIC_SUPABASE_URL` etc. actually resolved correctly by loading `/customers` and confirming it queries real data (this route doesn't depend on migration 012 at all, so it's the fastest true "is the app talking to the right database" check).

## 7. Smoke Tests

### 012 + 013
```bash
DATABASE_URL="postgres://..." npm run db:smoke-test:v3
```
Run immediately after §4a, same machine, same `DATABASE_URL`. Entirely read-only against real schema plus one fully-transactional, always-rolled-back functional test (inserts a throwaway inventory item/rate plan/reservation, verifies the exact overlap-detection query `availability-service.ts` uses behaves correctly against real Postgres, then rolls back — no data left behind). Checks: all 16 migration-012 tables exist, migration-013's 5 proposal columns exist, `ai_interaction_log`'s 3 additional columns exist (the RC2 corruption-repair columns), the 4 app-critical indexes exist, RLS+policy is present on every new table, both seed properties are present, and the functional overlap-detection test passes both the conflict and no-conflict case.

**Expected output ends with:**
```
✅ All N checks passed. Migrations 012/013 are structurally sound and functionally correct.
```
If anything fails, the script prints exactly which check(s) failed — investigate that specific item, don't re-run blind.

### 004
No automated smoke test exists. Manually verify via SQL Editor or `psql`:
```sql
select count(*) from broadcast_campaigns;   -- expect 0 (empty, no campaigns created yet)
select count(*) from festival_calendar;     -- expect 18 (the seeded 2026 festivals)
select is_vip, lifetime_value from leads limit 1;  -- should not error (columns exist)
```
Then load `/campaigns` in the app and confirm the campaign list loads (empty is fine) without a 500 error — that's the real end-to-end confirmation this migration succeeded.

## 8. Expected Results Summary

| Step | Success signal |
|---|---|
| `db:migrate:v3` | `✅ Migrations 012 and 013 applied successfully.` |
| Migration 004 | No SQL errors; `select count(*) from festival_calendar` returns 18 |
| `db:smoke-test:v3` | `✅ All N checks passed.` |
| `npm run build` | Exits 0, produces `.next/` output |
| App deploy | `/api/health` returns 200; `/customers` shows real data; `/campaigns` loads without a 500 (if 004 was applied) |

## 9. Recovery Procedures

- **Migration fails partway (012/013):** both files are idempotent — fix the specific error the script reports, then re-run the exact same `db:migrate:v3` command. It will skip everything already created.
- **Migration 004 fails partway:** same property (idempotent) — re-run `psql -f 004_phase4_campaigns.sql` after fixing the specific error.
- **Smoke test fails after a clean migration:** do not re-run the migration blind. The smoke test tells you exactly which check failed — that's a real schema discrepancy to investigate directly in the Supabase dashboard, not something a re-migration will fix (both migration files are additive-only; if a table/column/index is missing after a successful-looking run, something else changed it).
- **App deployed but `/api/health` or `/customers` fails:** check Vercel's environment variables were actually set (§2) — the most common cause of "works locally, fails in production" for this kind of app.
- **Something is badly wrong post-deploy:** roll back the application first (§5, instant, no data risk), then decide separately and calmly whether a database rollback is also needed — the two are independent and don't need to happen together.
