# BookMySpaces V3 — Backup and Restore

## What Needs Backing Up

- **Database** (Supabase Postgres) — the entire business: leads, customers, reservations, proposals, invoices, payments, conversations. This is the priority.
- **Environment variables / secrets** — not backed up by any automated system; keep a secure record (password manager, not a plaintext file) of every value in `.env.local` independent of the app itself, since losing these means regenerating API keys from scratch across Anthropic, OpenAI, Meta, Resend, and Google.
- **Application code** — already backed up by git history on GitHub (`origin`); not a separate concern here.

## Automated Backups

Supabase provides automated daily backups on paid plans, with retention length depending on plan tier — **confirm your specific plan's retention window** (Supabase Dashboard → Project Settings → Database → Backups) and make sure it meets your actual comfort level for how much data loss is acceptable (an hour of bookings? A day?). If you're on the free tier, there is no automated backup — this is worth upgrading before go-live given this system will hold real customer and payment data.

## Manual Backups (before any risky operation)

Before running a migration rollback, a bulk data change, or anything else with real destructive potential, take a manual snapshot regardless of automated backups being in place:

```bash
pg_dump "$DATABASE_URL" -f "backup-$(date +%Y%m%d-%H%M%S).sql"
```

Store this somewhere outside the Supabase project itself (not just in the same cloud account) — a backup that lives in the same place as what it's backing up doesn't protect against an account-level incident.

## What a Restore Looks Like

**Full restore from a Supabase automated backup:** Supabase Dashboard → Project Settings → Database → Backups → select a restore point. This is a Supabase-managed operation — follow their current dashboard flow, which may have changed since this document was written; don't rely on this document's specifics over what the dashboard actually shows.

**Restore from a manual `pg_dump`:**
```bash
psql "$DATABASE_URL" -f backup-20260714-120000.sql
```
Only do this against an empty/new database, or be very clear on whether you intend to overwrite existing data — `psql` will not warn you before it does.

## Testing Restores

An untested backup is not a real backup. At least once before go-live, and periodically afterward, actually restore a backup to a throwaway Supabase project (not your production one) and confirm the app can boot against it and the data looks right. This has not been done as part of any engineering session to date — it requires real Supabase access this sandbox has never had, and is one of the concrete first actions recommended once you have that access.

## Specific to This Project

- The two seeded properties (`skyline-serenity`, `monurama-homestay`) and any inventory/rate-plan data entered manually via the Supabase Table Editor (there's no admin UI for this yet) exist only in the database — make sure whoever adds this data knows it's not recoverable from application code if lost.
- `supabase/seed/staging_seed.sql` is safe to re-run (idempotent) if you need to restore the staging sample dataset specifically — this is not a substitute for a real production backup, only useful for staging/UAT environments.
