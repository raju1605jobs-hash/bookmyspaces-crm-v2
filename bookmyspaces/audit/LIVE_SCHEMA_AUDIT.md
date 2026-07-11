# LIVE_SCHEMA_AUDIT.md

Factual inventory of the live BookMySpaces Supabase database (`public` schema unless noted). Captured 2026-07-11 via a read-only SQL snapshot run by the user in the Supabase SQL Editor (Supabase MCP connector could not be established from this environment — see `CURRENT_STATUS.md`). Source data preserved in this document; the raw JSON result is in the conversation record for this session.

## Extensions

`pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`, `vector 0.8.0` (pgvector — backs `knowledge_chunks.embedding`).

## Tables (22 total, `public` schema)

| Table | RLS enabled | Policies | Notes |
|---|---|---|---|
| activity_events | ✅ | 1 (service_role) | Newer, more structured activity log than `activity_logs` |
| activity_logs | ❌ | 0 | Legacy activity log, no RLS at all |
| analytics_events | ✅ | 0 | RLS on but zero policies defined — effectively deny-all except service-role (bypasses RLS anyway) |
| bookings | ✅ | 1 (service_role) | FKs to `leads`, `proposals` |
| campaigns | ✅ | 1 (authenticated, unscoped `true`) | |
| conversations | ✅ | 1 (service_role only) | See drift note: migration-defined anon policies are **not present live** |
| escalations | ✅ | 1 (service_role) | Separate from `leads.escalation_required` / proposal escalation — a third, distinct escalation concept |
| follow_ups | ✅ | 0 | RLS on, zero policies — service-role only in practice |
| invoices | ✅ | 1 (authenticated, unscoped `true`) | **Not defined in any migration file** — see drift report |
| knowledge_chunks | ❌ | 0 | RAG source content, pgvector embedding column |
| lead_imports | ✅ | 1 (authenticated, unscoped `true`) | |
| leads | ✅ | 3 (2 authenticated unscoped + 1 service_role) | Core table — 46 live columns, several not in any migration (see drift report) |
| messages | ✅ | 1 (service_role) | **Not defined in any migration file** |
| notifications | ✅ | 3 (owner-scoped read/update + service_role) | Properly row-scoped via `auth.uid() = user_id` — best-designed RLS in the schema |
| packages | ✅ | 2 (public read where `is_active`, authenticated manage) | |
| payments | ✅ | 1 (authenticated, unscoped `true`) | **Not defined in any migration file** |
| proposals | ✅ | 3 (service_role x2 + public share-token read) | 66 live columns |
| scheduled_jobs | ✅ | 1 (service_role) | **Not defined in any migration file** |
| system_health_log | ❌ | 0 | **Not defined in any migration file** |
| user_profiles | ✅ | 3 (self read/update + service_role) | **Not defined in any migration file** — this is the auth/role backbone (`role` check: admin/manager/sales/marketing) |
| whatsapp_conversations | ✅ | 1 (service_role) | **Not defined in any migration file** — target table for the "dead" ISS-015 subsystem, and it already exists live |
| whatsapp_messages | ✅ | 1 (service_role) | **Not defined in any migration file** — same as above |

## Views (7 total)

| View | Defined in a migration? |
|---|---|
| active_users_view | ❌ No — joins `auth.users` + `user_profiles` + `leads`, not in any migration |
| hot_leads | ✅ Yes (008) |
| lead_analytics | ❌ No — not in any migration |
| lead_scoring_summary | ✅ Yes (008) |
| notification_summary | ❌ No — not in any migration |
| proposal_intelligence_view | ✅ Yes (010) |
| proposal_urgency_summary | ✅ Yes (010) |

`leads_needing_followup` (flagged in the original audit as ISS-012, defined 3x across migrations) does **not exist live at all** — it was never successfully applied, or was dropped.

## Functions (7 total)

`assign_invoice_number`, `assign_receipt_number`, `generate_proposal_number`, `match_knowledge_chunks`, `sync_proposal_payment_status`, `update_updated_at`, `update_updated_at_column` — all trigger functions except `match_knowledge_chunks` (pgvector similarity search, used by RAG). Only `generate_proposal_number`, `match_knowledge_chunks`, and `update_updated_at_column` have matching `CREATE FUNCTION` statements in the migration files; `assign_invoice_number`, `assign_receipt_number`, `sync_proposal_payment_status`, and `update_updated_at` are **not in any migration**.

## Triggers (12 total)

Attached to: `bookings` (updated_at), `conversations` (updated_at), `invoices` (invoice numbering), `leads` (updated_at), `payments` (receipt numbering, payment-status sync x2), `proposals` (proposal numbering, updated_at), `scheduled_jobs` (updated_at), `user_profiles` (updated_at), `whatsapp_conversations` (updated_at). Triggers on `invoices`, `payments`, `scheduled_jobs`, `user_profiles`, `whatsapp_conversations` are **not in any migration** — consistent with those tables themselves being undocumented.

## Row Level Security summary

19 of 22 tables have RLS **enabled**. 3 do not: `activity_logs`, `knowledge_chunks`, `system_health_log`. Of the 19 enabled, several have RLS on but zero policies (`analytics_events`, `follow_ups`) — functionally deny-all for any non-service-role client, which matters once ISS-006's session-scoped client migration lands (these routes will need explicit policies added, or they'll silently return empty results instead of erroring).

Every table with an authenticated-role policy uses an **unscoped `true` check** (`campaigns`, `invoices`, `lead_imports`, `leads` read/write, `payments`) — meaning any authenticated user (any logged-in staff account) can read/write any row, with no per-user or per-role restriction. Only `notifications` and `user_profiles` have real row-level scoping (`auth.uid() = user_id` / `auth.uid() = id`). This is the concrete starting point for ISS-006's "proper RLS" requirement — see `DATABASE_RECONCILIATION.md`.

## Storage buckets

Query returned `null` — either no buckets exist, or the role used to run the query doesn't have `storage.buckets` read access. Not yet confirmed either way.

## Auth configuration

Not captured by this SQL snapshot (auth provider settings, redirect URLs, JWT expiry, etc. live in Supabase project settings, not queryable via SQL). `auth.users` is referenced by `active_users_view` and by every table's `owner_id`/`created_by`/`user_id` FK-shaped columns (though most of those aren't declared as actual foreign keys — see drift report).
