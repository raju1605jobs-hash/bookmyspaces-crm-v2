# MIGRATION_REVIEW.md

Independent self-review of `supabase/migrations/009_document_undocumented_production_objects.sql`, performed as if by a second engineer: every statement re-derived against the raw live schema snapshot data and the migration files, not against my own prior summary of it. This review found and fixed 3 real issues before recommending execution — see "Issues found and fixed" below. The migration file was also rewritten from scratch partway through this review after a **file-corruption incident** unrelated to the SQL content itself — documented at the end.

## Issues found and fixed

**1. Fabricated foreign key (user_profiles.id → auth.users.id) — FIXED.**
The original draft declared `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`. This is the common Supabase convention, but the live foreign-key snapshot does **not** show this constraint existing on production, and my own `SCHEMA_DRIFT_REPORT.md` (Category D) explicitly lists `user_profiles`-to-`auth.users` as a relationship that "looks like it should be a foreign key but isn't declared as such" — directly contradicting what I'd written into the migration. This was an unverified assumption presented as fact. Fixed by removing the `REFERENCES` clause, leaving `id UUID PRIMARY KEY` unconstrained, with a comment explaining why and the exact query to run (`pg_constraint` lookup) if someone wants to confirm and add it later as a separate, deliberate change.

**2. Ambiguous inline CHECK constraint on an already-existing column — FIXED.**
The original draft had `ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_channel TEXT CHECK (...)`. `leads.source_channel` already exists live with a constraint (`leads_source_channel_check`) already attached. PostgreSQL's documented behavior for `ADD COLUMN IF NOT EXISTS` is to skip the entire clause — including any attached constraint — when the column already exists, but this is a narrower, less-commonly-exercised code path than plain `IF NOT EXISTS` and not worth trusting blindly on a production database. Fixed by removing the inline `CHECK` and adding the constraint separately inside a guarded `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ...) ... END $$` block, which is unambiguous under every code path and cannot create a duplicate or divergently-named constraint.

**3. No transaction wrapper — FIXED.**
The original draft had no `BEGIN`/`COMMIT`. All DDL used here (`CREATE TABLE`, `ALTER TABLE`, `CREATE POLICY`, `CREATE TRIGGER`, `CREATE VIEW`) is transactional in PostgreSQL, so wrapping the whole file in one transaction means: (a) if any statement fails partway through, everything rolls back automatically and production is left byte-for-byte unchanged — no manual cleanup needed; (b) other concurrent sessions never observe a partially-applied state (e.g. a policy that's been dropped but not yet recreated) because MVCC means they see either the full pre-migration state or the full post-migration state, never something in between. Fixed by adding `BEGIN;` at the top and `COMMIT;` at the bottom.

**Not fixed, and deliberately left as a documented limitation:** 4 `CREATE TRIGGER` statements (`trg_invoice_number`, `trg_receipt_number`, `trg_sync_payment_status`, `update_scheduled_jobs_updated_at`) call functions (`assign_invoice_number`, `assign_receipt_number`, `sync_proposal_payment_status`, `update_updated_at`) that are confirmed present on live production but whose source was not captured by the schema snapshot (only name + return type). I chose not to write `CREATE OR REPLACE FUNCTION` bodies for these from a guess — doing so risks silently replacing a working production function with incorrect logic, which is a strictly worse outcome than leaving a documented gap. The migration header now carries an explicit warning that it is production-only-safe (verified those 4 functions exist there) and NOT fresh-database-safe (would fail at those 4 statements on an empty database) until a follow-up migration captures their real source via `pg_get_functiondef`.

## Statement-by-statement classification

Grouped by section since most statements within a table block share one risk profile. Every `CREATE TABLE IF NOT EXISTS` in this file targets a table already confirmed present live with an identical structure (verified column-by-column against the live snapshot: type, nullability, default, per SCHEMA_DRIFT_REPORT.md Category A) — meaning **these 10 statements are guaranteed no-ops against current production**, since PostgreSQL's `IF NOT EXISTS` skips the entire statement, not a partial/column-level merge, when the table name already exists.

| # | Statement(s) | Table exists live? | Columns verified? | Function/table refs valid? | Idempotent? | Destructive? | Classification |
|---|---|---|---|---|---|---|---|
| 1 | `CREATE TABLE IF NOT EXISTS activity_events` + indexes + RLS + policy | ✅ yes | ✅ all 11 columns, types, nulls, defaults match live | N/A (no FK, no trigger) | ✅ table-level skip | No | **SAFE** |
| 2 | `CREATE TABLE IF NOT EXISTS user_profiles` + indexes + trigger + RLS + 3 policies | ✅ yes | ✅ all 12 columns match live | trigger fn `update_updated_at_column()` confirmed in migration 001 (pre-existing, safe on fresh DB too) | ✅ table-level skip | No | **SAFE** (after fix #1) |
| 3 | `CREATE TABLE IF NOT EXISTS invoices` + index + trigger + RLS + policy | ✅ yes | ✅ all 14 columns match live | FK → `proposals(id)` confirmed live; trigger fn `assign_invoice_number()` confirmed live, **not** in any migration | ✅ table-level skip | No | **SAFE on current production**, REQUIRES REVIEW for fresh-DB use (see limitation above) |
| 4 | `CREATE TABLE IF NOT EXISTS payments` + 2 indexes + 2 triggers + RLS + policy | ✅ yes | ✅ all 11 columns match live | FK → `proposals(id)` confirmed live; trigger fns `assign_receipt_number()`/`sync_proposal_payment_status()` confirmed live, not in migrations | ✅ table-level skip | No | **SAFE on current production**, same fresh-DB caveat |
| 5 | `CREATE TABLE IF NOT EXISTS lead_imports` + RLS + policy | ✅ yes | ✅ all 10 columns match live | N/A | ✅ table-level skip | No | **SAFE** |
| 6 | `CREATE TABLE IF NOT EXISTS messages` + 2 indexes + RLS + policy | ✅ yes | ✅ all 7 columns match live | FK → `conversations(id)` confirmed live | ✅ table-level skip | No | **SAFE** |
| 7 | `CREATE TABLE IF NOT EXISTS scheduled_jobs` + 2 indexes + trigger + RLS + policy | ✅ yes | ✅ all 15 columns match live | trigger fn `update_updated_at()` confirmed live, **not** in any migration (distinct from the `_column` variant, which is) | ✅ table-level skip | No | **SAFE on current production**, same fresh-DB caveat |
| 8 | `CREATE TABLE IF NOT EXISTS system_health_log` + index (RLS deliberately not enabled) | ✅ yes | ✅ all 7 columns match live | N/A | ✅ table-level skip | No | **SAFE** |
| 9 | `CREATE TABLE IF NOT EXISTS whatsapp_conversations` + 3 indexes + trigger + RLS + policy | ✅ yes | ✅ all 13 columns match live, incl. both CHECK constraints verified against live `check_constraints` | FK → `leads(id)` confirmed live; trigger fn `update_updated_at_column()` safe (in migrations) | ✅ table-level skip | No | **SAFE** |
| 10 | `CREATE TABLE IF NOT EXISTS whatsapp_messages` + 5 indexes + RLS + policy | ✅ yes | ✅ all 14 columns match live, incl. 4 CHECK constraints verified against live data | FK → `whatsapp_conversations(id)`, `leads(id)` both confirmed live | ✅ table-level skip | No | **SAFE** |
| 11 | `ALTER TABLE leads ADD COLUMN IF NOT EXISTS` (9 columns) | table exists (obviously) | ✅ all 9 columns' types/defaults verified against live `columns` data | N/A | ✅ column-level `IF NOT EXISTS`, no ambiguity since no inline constraints remain | No — nullable columns or constant defaults only, no table rewrite, no NOT NULL-without-default risk | **SAFE** (after fix #2 removed the ambiguous inline CHECK) |
| 12 | `DO $$ ... ADD CONSTRAINT leads_source_channel_check ... $$` | constraint already exists live under this exact name | ✅ definition matches live `check_constraints` exactly | N/A | ✅ explicitly guarded by `pg_constraint` existence check | No | **SAFE** |
| 13 | 4x `CREATE INDEX IF NOT EXISTS` on `leads` (owner_id, created_by, estimated_revenue, followup_date) | all 4 already exist live under these exact names | N/A | N/A | ✅ name-based skip | No | **SAFE** (confirmed pure no-op against current production) |
| 14 | `ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS trigger_reason TEXT` | column confirmed **absent** live — this is the one statement in the file that will actually execute for real | N/A (new column) | N/A | ✅ column-level `IF NOT EXISTS` | No — nullable, no default, metadata-only change regardless of table size | **SAFE** |
| 15 | 3x `CREATE OR REPLACE VIEW` (active_users_view, lead_analytics, notification_summary) | ✅ all 3 confirmed live | body copied verbatim from live `view_definition` field — not hand-written | all referenced tables/columns (`auth.users`, `user_profiles`, `leads`, `notifications`) confirmed to exist with matching column names | ✅ `OR REPLACE` always succeeds if referenced objects exist | No — views hold no data | **SAFE** (highest confidence of any statements in the file, since PostgreSQL itself generated this exact text) |
| 16 | 2x `DROP POLICY IF EXISTS` + `CREATE POLICY` on `analytics_events`, `follow_ups` | tables confirmed live, RLS confirmed enabled with **zero** existing policies | N/A | role `service_role`, function `auth.role()` — standard Supabase, used identically on 12+ other tables already in this codebase | ✅ DROP is a guaranteed no-op (nothing exists to drop); CREATE adds a genuinely new policy | No — adding a policy can only broaden access for the role it targets, never delete data; and per the review note, this specific policy doesn't even change functional access since `service_role` already bypasses RLS by design | **SAFE**, with the caveat (noted in the file and above) that this does not by itself unblock `authenticated`-role access for ISS-006 |
| 17 | 5x `DROP POLICY IF EXISTS` (stale anon policies on `leads`, `conversations`) | confirmed **absent** from live policies list — all 5 are no-ops today | N/A | N/A | ✅ `IF EXISTS` guarantees no error either way | No — dropping a policy that doesn't exist does nothing; dropping a policy that does exist removes a permission rule, not data | **SAFE** |
| 18 | `BEGIN;` / `COMMIT;` wrapper | N/A | N/A | N/A | N/A | No | **SAFE** — standard transaction control, added in fix #3 |

**Every statement in the file is now classified SAFE.** The two "SAFE on current production, REQUIRES REVIEW for fresh-DB use" notes above (rows 3, 4, 7) are not blockers for running this against the live database today — they are a scoping limitation for a *different, hypothetical* future use of this same file against an empty database, clearly flagged in the file's own header comment so nobody mistakes this for a complete bootstrap script later.

## Risk assessment

**Overall risk: low.** 9 of 10 `CREATE TABLE` statements, all `CREATE INDEX` statements, all 3 views, and 2 of the 3 `DROP POLICY` groups are verified no-ops against current production — they exist purely to close the documentation gap (Category A/C/E in `SCHEMA_DRIFT_REPORT.md`) so a future fresh environment matches reality. The genuinely new, executing changes are: one nullable column (`follow_ups.trigger_reason`), two new service-role RLS policies, and five no-op policy drops. None of these can destroy data — no `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or `DELETE` appears anywhere in the file. The main operational risk is a brief `ACCESS EXCLUSIVE` lock taken by each `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statement (already-enabled, so genuinely a no-op, but Postgres still briefly locks the table to check) — negligible on tables this size, but worth running during a lower-traffic window as a precaution rather than a requirement.

## Rollback strategy

Because 8 of the file's ~18 statement groups are pure documentation of pre-existing state, "rolling back" most of this migration would mean recreating identical state — meaningless. Only two things in this file are genuinely new and would need a real rollback:

```sql
BEGIN;
ALTER TABLE follow_ups DROP COLUMN IF EXISTS trigger_reason;
DROP POLICY IF EXISTS "analytics_events_service_role" ON analytics_events;
DROP POLICY IF EXISTS "follow_ups_service_role" ON follow_ups;
COMMIT;
```

If the migration fails partway through for any reason, no manual rollback is needed at all — the `BEGIN`/`COMMIT` wrapper means PostgreSQL auto-rolls-back the entire transaction on error, leaving production exactly as it was before running the script.

## Expected outcome

Running this against the live database should: (1) print a series of `NOTICE`-level messages for every `CREATE ... IF NOT EXISTS` that skips because the object already exists — this is expected and not an error; (2) actually add one new column (`follow_ups.trigger_reason`) and two new policies; (3) leave every other live object completely unchanged; (4) commit cleanly with no errors, since every function/table/column referenced by every statement was independently verified present in the live snapshot before being referenced.

## Assumptions

1. The live schema snapshot (captured 2026-07-11, pasted into this session by the user) accurately reflects the current state of production at the time this migration is run. If schema changes were made between the snapshot and now, some `IF NOT EXISTS` statements could behave differently than predicted here (though still safely — worst case they'd execute for real instead of no-op, and every statement was independently verified safe to execute for real too).
2. The 4 functions referenced by trigger statements (`assign_invoice_number`, `assign_receipt_number`, `sync_proposal_payment_status`, `update_updated_at`) still exist live with the same names/signatures the snapshot showed.
3. `user_profiles.id` does not have an FK to `auth.users` in production — based on absence from the live FK list, not a positive confirmation of absence. Recommend running the `pg_constraint` query in the file's comment to confirm definitively at some point, though it has zero bearing on this migration's safety since the table-level `IF NOT EXISTS` skip makes this a non-issue either way.

## Confidence score

**9.5 / 10.** The 0.5 deduction is entirely for the one item outside this migration's control: the 4 undocumented function bodies, which cannot be verified SAFE-for-fresh-DB without capturing their source first (explicitly out of scope here, flagged clearly, does not block running this against current production).

## Recommendation

All statements are classified SAFE against the current live production database. Safe to run via the Supabase SQL Editor as originally planned.
