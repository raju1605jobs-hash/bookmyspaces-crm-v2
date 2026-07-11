# SCHEMA_DRIFT_REPORT.md

Diff between the live database (`LIVE_SCHEMA_AUDIT.md`), the 9 migration files (`supabase/migrations/001` through `010`, `009` missing — ISS-011), and the application code. This supersedes and significantly expands the original audit's ISS-009/ISS-010/ISS-049 findings, which under-counted the drift because they were based on static code-grep, not a live query.

## Category A — Tables that exist LIVE but appear in NO migration file (10 tables)

`activity_events`, `invoices`, `lead_imports`, `messages`, `payments`, `scheduled_jobs`, `system_health_log`, `user_profiles`, `whatsapp_conversations`, `whatsapp_messages`.

This is the single biggest finding of this audit. **Nearly half the live schema (10 of 22 tables) has no corresponding migration.** All 10 have real columns, indexes, RLS, and (for most) FK constraints and triggers — this is production-quality schema work, not stray test tables. Supporting evidence this was deliberate, applied work rather than junk:
- `invoices` and `payments` power the live invoice route (`src/app/api/proposals/[id]/invoice/route.ts`, touched in ISS-040) and have proper triggers (`assign_invoice_number`, `assign_receipt_number`) and a payment-status sync trigger to `proposals`.
- `user_profiles` is the entire staff/role backbone (`role` check constraint: admin/manager/sales/marketing), referenced by `active_users_view`.
- `whatsapp_conversations` and `whatsapp_messages` are exactly the two tables the original audit (ISS-015) said the "dead" secondary WhatsApp subsystem needed but didn't have — **they already exist live**, fully built (state-machine `current_state` check constraint matching `conversation-manager.ts`'s expected states almost exactly: `NEW_INQUIRY`, `WAITING_FOR_EVENT_TYPE`, `WAITING_FOR_EVENT_DATE`, `WAITING_FOR_GUEST_COUNT`, `QUALIFIED`, `HANDOFF_TO_OPERATOR`).
- `scheduled_jobs` looks like general-purpose job infrastructure (`job_type`, `attempts`, `max_attempts`, `next_retry_at`) that nothing in the current codebase imports/queries — another candidate for the "unfinished feature" investigation pattern.

**Most likely explanation:** migration `009` is missing from the sequence (already flagged as ISS-011). This is very likely where these 10 tables were created — as a migration that was run directly against production (e.g. via Supabase SQL Editor or dashboard) but never saved to `supabase/migrations/009_*.sql` and committed. The gap number (009, between 008 and 010) lines up exactly.

## Category B — Tables defined in migrations but NOT present live (8 tables)

`ai_summaries`, `blocked_dates`, `broadcast_campaigns`, `documents`, `festival_calendar`, `message_queue`, `notification_settings`, `staff_performance`.

These migrations exist in the repo (mostly in `004_phase4_campaigns.sql` and `007_missing_tables.sql`) but were never applied to the live database, or were applied and later dropped. Directly resolves the original **ISS-007** finding ("notification_settings has a policy but RLS was never enabled") — that finding is **moot**: `notification_settings` doesn't exist live at all, so there's no RLS gap to fix on it. The live database instead has a completely different, already-well-secured `notifications` table (owner-scoped RLS, not from any migration — see Category A) that serves the same purpose. Recommend closing ISS-007 as "superseded — table replaced by a different, already-secure live table" rather than fixing it as originally scoped.

## Category C — Columns that exist LIVE but were never added by a migration

- **`leads.escalation_required`** (boolean, default `false`) — confirms the finding from the ISS-017 investigation. Migration 010 only adds `escalation_required` to `proposals`, never to `leads`, yet it's live on `leads` too and already read by `src/app/api/leads/hot/route.ts` and `src/app/api/dashboard/stats/route.ts`.
- **`leads.lead_stage`** (text, default `'NEW'`) — confirms the original **ISS-010** finding. Live and actively used (`active_users_view` filters on it, `proposal_intelligence_view` joins it), but no migration creates it.
- **`leads.owner_id`, `leads.created_by`, `leads.updated_by`, `leads.assigned_at`, `leads.source_channel`, `leads.last_follow_up_at`, `leads.next_follow_up_at`, `leads.follow_up_count`** — none of these appear in any migration either. `owner_id` in particular is significant: it's what `active_users_view` uses to compute each staff member's `assigned_leads` count, and it's exactly the column a real per-owner RLS policy for ISS-006 would need to filter on (`owner_id = auth.uid()`), but it currently has no FK constraint to `auth.users` or `user_profiles` at all (see Category D).

## Category D — Missing foreign keys on relationship-shaped columns

The live FK list only covers 11 relationships (`bookings`→leads/proposals, `conversations`→leads, `follow_ups`→leads, `invoices`→proposals, `messages`→conversations, `payments`→proposals, `proposals`→leads, `whatsapp_conversations`→leads, `whatsapp_messages`→whatsapp_conversations/leads). Columns that look like they should be foreign keys but aren't declared as such: `leads.owner_id`, `leads.created_by`, `leads.updated_by` (should reference `auth.users.id` or `user_profiles.id`), `campaigns.created_by`, `lead_imports.imported_by`, `scheduled_jobs.created_by`, `activity_events.user_id`, `notifications.user_id` (this one is enforced only via RLS policy `auth.uid() = user_id`, not a real FK). Not necessarily wrong (Supabase commonly leaves `auth.users` FKs off for portability), but worth deciding deliberately rather than by accident.

## Category E — Views live but not in any migration (3)

`active_users_view`, `lead_analytics`, `notification_summary` — same pattern as Category A, likely part of the same undocumented "migration 009" work.

## Category F — Views in migrations but not live (1)

`leads_needing_followup` — defined three separate times across migration history (already flagged as **ISS-012**) but doesn't exist in the live database at all. Confirms ISS-012's premise (multiple competing definitions) and adds a further twist: none of them actually won — the view was never successfully created, or was later dropped.

## Category G — RLS policy drift: migrations define policies that are NOT present live

`conversations` migrations (`001_initial_schema.sql` lines 254-259, `005_stability_patch.sql` lines 86-91) define anonymous-access policies: `"Anon can insert conversations"` (INSERT, `WITH CHECK TRUE`), `"Anon can update own conversations"` / `"conversations_anon_update"` (UPDATE, `USING TRUE` — this is the exact policy the original audit flagged as **ISS-008**), and `"conversations_anon_insert"`. **None of these three policies exist on the live `conversations` table** — live only has one policy, `"Service role full access"`. Same pattern on `leads`: migration 001 defines `"Anon can insert leads"` (INSERT, `WITH CHECK TRUE`); live `leads` has no anon insert policy at all, only two authenticated-role policies plus service-role.

**This means ISS-008, as originally described, is already fixed in production** — someone removed the unscoped anon UPDATE policy at some point, which is a good thing. But the migration files still contain the `CREATE POLICY` statements that would recreate it. If migrations are ever re-run against a fresh database (a new environment, disaster recovery, staging), the vulnerability comes back. This needs a formal migration that explicitly drops these anon policies, so the migration history matches reality and stays fixed everywhere, not just on the current production database by accident.

## Category H — RLS enabled with zero policies

`analytics_events` and `follow_ups` have RLS **on** but **no policies at all**. Under Postgres RLS semantics this means only the table owner / superuser (or `service_role`, which bypasses RLS by design in Supabase) can read or write — any session-scoped `authenticated` client would get empty results or a permission error, not a clear failure. This is a **blocking issue for ISS-006**: migrating these two tables' routes to a session-scoped client without first adding policies will silently break them.

## Summary counts

| Category | Count |
|---|---|
| Tables live, not in any migration | 10 |
| Tables in migrations, not live | 8 |
| Columns live, not in any migration (leads alone) | 9 confirmed |
| Views live, not in any migration | 3 |
| Views in migrations, not live | 1 |
| Functions live, not in any migration | 4 of 7 |
| Triggers live, not in any migration | 5 of 12 |
| Tables with RLS on but zero policies | 2 |
| Tables with RLS disabled entirely | 3 |
| Migration-defined RLS policies absent live (already fixed, undocumented) | 4 |

This is a much larger gap than the original audit's ISS-009/ISS-010/ISS-049 (which flagged "5 tables/views + 1 column"). See `DATABASE_RECONCILIATION.md` for the resolution plan.
