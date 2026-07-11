# DATABASE_RECONCILIATION.md

Reconciles `SCHEMA_DRIFT_REPORT.md` findings against `MASTER_ISSUE_REGISTER.csv` and produces a concrete action plan. No implementation has happened yet — this is the plan, per the "no fixes until reconciliation is complete" instruction. All actions below are **additive only** (no historical migration is edited, per the user's database rules).

## Principle

The live database is the source of truth (per explicit instruction). Where code/migrations disagree with live reality, migrations get corrected to *document* live reality — they do not get used to *change* live reality, except where live reality itself has a genuine gap (RLS policies, missing FKs) that needs a real fix.

## Action plan by issue

### ISS-006 (hybrid auth architecture) — proceed, with two new prerequisites
Live data confirms this is necessary and gives the real starting point: every `authenticated`-role policy currently in place is unscoped (`USING (auth.role() = 'authenticated')`, no row filtering) except `notifications` and `user_profiles`, which already do it correctly (`auth.uid() = user_id` / `id`). Two things must happen **before** any route is switched to a session-scoped client:
1. Add policies to `analytics_events` and `follow_ups` (currently RLS-on-zero-policies — Category H) — otherwise those routes silently break.
2. Decide the ownership model for `leads` (and by extension `proposals`, `bookings` which cascade from it): the `owner_id` column already exists live and is unused by any policy today. Recommend a policy shaped like `owner_id = auth.uid() OR role IN ('admin','manager')` (role sourced from `user_profiles`), replacing the current unscoped `auth.role() = 'authenticated'` policies on `leads`, `proposals`, `payments`, `invoices`, `campaigns`, `lead_imports`.

### ISS-007 (notification_settings RLS) — close as superseded
The table doesn't exist live. The live `notifications` table already has correct owner-scoped RLS and isn't in any migration. Recommended resolution: write a migration that documents `notifications` as it actually exists live (Category A/E pattern below), and mark the original `notification_settings` migration work as abandoned/superseded in a comment. No RLS fix needed — it's already correct.

### ISS-008 (conversations anon UPDATE with USING TRUE) — close as already-fixed-in-production, but migration file still dangerous
Live has no such policy. Needed action: an additive migration that explicitly `DROP POLICY IF EXISTS` for the three anon policies (`"Anon can insert conversations"`, `"Anon can update own conversations"`, `"conversations_anon_insert"`, `"conversations_anon_update"`, `"Anon can insert leads"`) so migration history matches production and a fresh environment doesn't reintroduce the hole. Low risk, single migration file.

### ISS-009 / ISS-010 / ISS-049 (original schema drift) — resolved and superseded by this report
`ISS-010`'s `leads.lead_stage` finding is confirmed. `ISS-009`'s "5 tables/views" claim is superseded — the real number is 10 live-only tables + 3 live-only views (Category A/E), roughly double the original estimate. Recommended resolution: a single consolidated **documenting migration** (proposed `009_document_undocumented_production_objects.sql`, deliberately filling the missing slot) using `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE VIEW` / `ADD COLUMN IF NOT EXISTS` for every Category A/C/E object, matching live definitions exactly (idempotent, changes nothing live, just backfills the paper trail). This single migration closes ISS-009, ISS-010, and ISS-049 simultaneously.

### ISS-011 (migration 009 missing) — resolved by the above
The proposed documenting migration fills slot `009`, closing this gap directly and confirming the working theory of what happened to it.

### ISS-012 (leads_needing_followup defined 3x) — close as moot, but decide if the view is wanted
It doesn't exist live at all — none of the three competing definitions won. Decision needed: either drop all three definitions from the migration files (nothing live depends on a view that was never created), or pick the best of the three and add it in the same documenting migration if a "leads needing followup" view is actually useful (it would be, e.g., for a real follow-up dashboard once ISS-018 is integrated).

### ISS-015 (secondary WhatsApp subsystem) — unblocked, now a smaller job than expected
Original estimate: "Large effort — needs new migration for two tables." **Correction: the tables already exist live**, fully built, with a `current_state` check constraint that closely matches the code's state machine. Remaining work is now purely application-level: wire `conversation-manager.ts` / `auto-responder.ts` / `lead-resolver.ts` / `send-message.ts` / `process-inbound.ts` into the live webhook route, resolve the duplicate Meta Graph API call (ISS-043) by keeping one implementation, and reconcile against the live column set (e.g. `whatsapp_conversations.current_state` values must exactly match what `conversation-manager.ts` expects — needs a line-by-line check before wiring). No new migration required for the tables themselves. Effort re-estimated from Large to Medium.

### ISS-017 (escalation-engine.ts) — unblocked
`leads.escalation_required` exists live. `applyEscalation()`'s write path (`db.from('leads').update({ escalation_required: true, ... })`) will work as-is. Safe to wire into the webhook path after lead scoring, per the file's own header comment. No schema change needed.

### ISS-018 (followup-rules.ts) — unblocked, with one gap to close
`follow_ups` table exists live with `type`, `status`, `scheduled_at`, `message` columns — matches what the live cron job already reads. It does **not** have a column for `trigger_reason` (which `followup-rules.ts`'s cadence steps use to pick a message template and to know which cadence step a given follow-up represents). Two options: (a) store `trigger_reason` inside the existing `message` field indirectly (reconstruct from content — fragile), or (b) add one additive column, `follow_ups.trigger_reason TEXT`, in the same documenting migration. Recommend (b) — trivial, non-breaking, and makes the integration far more reliable. Also note: `follow_ups` currently has RLS-on-zero-policies (Category H) — needs a service-role policy at minimum, since the cron job uses `getSupabaseAdmin()` (service-role bypasses RLS, so this isn't a functional blocker today, but matters once/if this route is ever touched from a session-scoped client).

### ISS-043 (duplicate Meta API call) — proceed as originally scoped, resolved alongside ISS-015.

## Consolidated migration plan (proposed `009_document_undocumented_production_objects.sql`)

All additive, all idempotent (`IF NOT EXISTS`), safe to run against production with zero risk of data loss or behavior change:
1. `CREATE TABLE IF NOT EXISTS` for: `activity_events`, `invoices`, `lead_imports`, `messages`, `payments`, `scheduled_jobs`, `system_health_log`, `user_profiles`, `whatsapp_conversations`, `whatsapp_messages` — column definitions taken verbatim from the live schema snapshot.
2. `ALTER TABLE leads ADD COLUMN IF NOT EXISTS` for: `escalation_required`, `owner_id`, `created_by`, `updated_by`, `assigned_at`, `source_channel`, `last_follow_up_at`, `next_follow_up_at`, `follow_up_count`.
3. `ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS trigger_reason TEXT` (new, not yet live — needed for ISS-018).
4. `CREATE OR REPLACE VIEW` for: `active_users_view`, `lead_analytics`, `notification_summary`.
5. `CREATE OR REPLACE FUNCTION` for: `assign_invoice_number`, `assign_receipt_number`, `sync_proposal_payment_status`, `update_updated_at`.
6. `CREATE TRIGGER IF NOT EXISTS`-equivalent (Postgres needs `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`) for the 5 undocumented triggers.
7. `DROP POLICY IF EXISTS` for the 4 stale anon policies on `leads`/`conversations` identified in Category G (closes ISS-008 formally).
8. New policies for `analytics_events` and `follow_ups` (closes the ISS-006 prerequisite from Category H) — minimum viable: service-role-only to start, refined once ISS-006's ownership model is implemented.
9. Comment block noting `notification_settings`, `ai_summaries`, `blocked_dates`, `broadcast_campaigns`, `documents`, `festival_calendar`, `message_queue`, `staff_performance` (Category B) are defined in earlier migrations but were never applied live and are not currently used by any route — flagged for a future "delete or finish" decision, same pattern as ISS-015/017/018, out of scope for this migration.

## Recommended next steps, in order

1. Write and apply the consolidated migration above (documents reality, adds the one new column, fixes the two RLS gaps, drops the stale policies).
2. Re-run `npx tsc --noEmit` and the test suite (no code changes yet, but confirms nothing regresses).
3. Proceed to ISS-017 integration (smallest, fully unblocked).
4. Proceed to ISS-018 integration (needs the new `trigger_reason` column from step 1).
5. Proceed to ISS-015 integration (largest of the three, needs careful state-machine reconciliation).
6. Begin ISS-006's route-by-route migration to session-scoped clients, starting with the tables that already have correct RLS (`notifications`, `user_profiles`) as a template, then `leads`/`proposals` with the new owner-scoped policy.

This plan keeps every step additive, testable, and reversible, consistent with the "never leave the application in a broken state" and "prefer additive migrations" rules.
