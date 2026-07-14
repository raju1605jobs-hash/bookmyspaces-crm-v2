# BookMySpaces V3 — Admin Manual

For whoever holds the Admin role: system configuration, user management, and first-line troubleshooting.

## System Administration

BookMySpaces runs on Next.js 14 (App Router), hosted on Vercel, backed by Supabase (Postgres + Auth). Application configuration lives in environment variables (`.env.local` locally, Vercel Project Settings in production) — see `PRODUCTION_DEPLOYMENT_GUIDE.md` for the full reference and current status of each one.

## User Management

Staff accounts are provisioned through Supabase Auth (Supabase Dashboard → Authentication → Users), not through any in-app signup flow — this is intentional, so only someone with Supabase dashboard access can create a new login. After creating a user in Supabase, their role/permissions are set via the app's own user-management screen (Admin-only) or directly in the `user_profiles` table.

## Roles & Permissions

Role checks happen server-side on every route via `requireAuth()`/`requireRole()` — the UI hiding a button is a convenience, not the actual security boundary. Roles observed in the schema: admin, manager, sales, marketing (see `user_profiles.role`'s check constraint). Admin actions (role changes, activation/deactivation, user creation) are logged with the acting user's ID — check application logs if you need to know who changed what.

## CRM (Leads & Customers)

Leads arrive automatically from connected channels (WhatsApp, website chat) or can be added manually. Identity Resolution matches leads to existing customers by phone number across channels — if you ever see what looks like a duplicate customer, check whether the phone numbers actually match exactly (formatting differences can cause this; the system normalizes to one canonical format going forward, but pre-existing records may not have been retroactively normalized).

## Reservations, Pricing, Inventory

The Reservation Platform (properties → inventory items → rate plans / meal plans / add-ons → reservations) has **no admin UI yet for adding inventory or rate plans** — this is currently done directly via the Supabase Table Editor or SQL. `supabase/seed/staging_seed.sql` has realistic example rows to copy the shape from. This is a known gap worth prioritizing (see `VERSION1_1_ROADMAP.md`).

## Invoices & Payments

Invoice/receipt numbers are assigned by database triggers, not application code — don't try to set them manually. Payments are simple additive records against a proposal; there's no payment-editing or deletion in the UI by design — corrections are made by recording an offsetting entry (see `FINANCE_USER_GUIDE.md`'s refund convention), preserving a full audit trail.

## Campaigns

The Campaigns feature's backing database tables (`broadcast_campaigns`, `festival_calendar`, and related) come from a separate migration (004) that may not have been applied to your live database — check before assuming this feature works; if it hasn't been applied, every Campaigns action will fail with a server error. Either apply migration 004 (`PRODUCTION_DEPLOYMENT_GUIDE.md` §3a/§4b) or keep the Campaigns nav link hidden until you do.

## AI

Two providers are configured: Anthropic (primary) and OpenAI (embeddings/fallback) — both need valid API keys set. The AI Assistant (Customer Summary/Suggested Reply/Recommendations) reads from `ai_interaction_log` for its audit trail; no admin action needed for normal operation, but if AI features stop responding, check both API keys are still valid/funded first.

## Dashboards

Operations and Revenue dashboards both query live data on every load (no caching layer) — if either seems slow, that's a real query-performance question, not a stale-cache issue. See `PRODUCTION_DEPLOYMENT_GUIDE.md` for what "everything working" looks like post-deploy.

## Troubleshooting

| Symptom | Likely cause | What to check |
|---|---|---|
| Revenue Dashboard's Bookings KPI is zero / shows "not live yet" | Migration 012 not applied | Run migration 012/013, `PRODUCTION_DEPLOYMENT_GUIDE.md` §4a |
| Campaigns page shows a server error | Migration 004 not applied | Same guide, §3a/§4b |
| A deal isn't showing in revenue totals despite being paid | Proposal was never explicitly marked "Accepted" | Proposals page → set status to Accepted (not just recording a payment) |
| WhatsApp messages not arriving | `WHATSAPP_APP_SECRET` unset, or webhook misconfigured in Meta dashboard | Confirm env var set; confirm webhook URL/verify-token match Meta's app config |
| Login/logout not working | Supabase session/middleware issue | Check Supabase project status first; this is the most common outage cause for that class of bug |
| A record looks duplicated | Identity Resolution phone-format mismatch | Compare the two records' phone fields character-by-character |

## Backup

See `BACKUP_AND_RESTORE.md`. Summary: Supabase's own automated backups are the primary mechanism — confirm your plan tier includes the retention window you need, and take a manual `pg_dump` before any risky operation (a migration rollback, a bulk data change) regardless of automated backups.

## Recovery

See `DISASTER_RECOVERY_PLAN.md` for scenario-by-scenario recovery steps (database loss, deployment failure, credential compromise, etc.).
