# DATABASE_AUDIT.md — Supabase Database (Part 4)

All 9 migration files read in full: `001_initial_schema.sql` (266 lines), `002_phase2_whatsapp.sql` (117), `003_phase3_proposals.sql` (158), `004_phase4_campaigns.sql` (162), `005_stability_patch.sql` (345), `006_final_verification.sql` (289), `007_missing_tables.sql` (318), `008_phase1_lead_scoring.sql` (111), `010_phase5_proposal_intelligence.sql` (344). Root duplicate `007_missing_tables.sql` VERIFIED byte-identical to the `supabase/migrations/` copy (`diff` = zero output), not re-read separately. Migration `009_*.sql` VERIFIED absent from the entire repository.

Machine-readable summary: `migrations.csv`.

## Tables created (19 total, via CREATE TABLE)

| Table | Created in | Columns (name: type, constraints — compact) |
|---|---|---|
| `leads` | `001:13-68` | id UUID PK, created_at/updated_at TIMESTAMPTZ, name/phone/email TEXT, event_type/event_date(DATE)/guest_count(INT)/budget/special_requirements/venue TEXT, status TEXT CHECK(7 values) DEFAULT 'new_inquiry', source TEXT CHECK(6 values) DEFAULT 'website', assigned_to/notes TEXT, sheets_synced BOOL DEFAULT FALSE, sheets_row_id TEXT, followup_date/proposal_sent_at/last_contacted_at TIMESTAMPTZ, inquiry_summary TEXT, tags TEXT[] DEFAULT '{}', lead_score INT DEFAULT 5. Later extended (see "Columns added via ALTER" below). |
| `conversations` | `001:73-100` | id UUID PK, created_at/updated_at, lead_id UUID FK→leads(id) ON DELETE SET NULL, session_id TEXT NOT NULL UNIQUE, channel TEXT CHECK(website/whatsapp) DEFAULT 'website', messages JSONB DEFAULT '[]', summary TEXT, extracted_name/phone/email/event_type/event_date/guest_count/budget TEXT, is_active BOOL DEFAULT TRUE, is_escalated BOOL DEFAULT FALSE, escalation_reason TEXT |
| `knowledge_chunks` | `001:105-123` | id UUID PK, created_at, source_file TEXT NOT NULL, source_type TEXT CHECK(5 values), category TEXT CHECK(7 values), content TEXT NOT NULL, chunk_index INT DEFAULT 0, embedding vector(1536), metadata JSONB DEFAULT '{}' |
| `documents` | `001:128-146` | id UUID PK, created_at, name/original_filename/file_type TEXT NOT NULL, file_size INT, storage_path/category/description TEXT, processed BOOL DEFAULT FALSE, chunk_count INT DEFAULT 0, error TEXT, uploaded_by TEXT DEFAULT 'admin' |
| `activity_logs` | `001:151-160` | id UUID PK, created_at, lead_id UUID FK→leads(id) ON DELETE CASCADE, action TEXT NOT NULL, description TEXT, performed_by TEXT DEFAULT 'system', metadata JSONB DEFAULT '{}' |
| `message_queue` | `002:9-31` | id UUID PK, created_at, phone/message TEXT NOT NULL, type TEXT CHECK(session/template) DEFAULT 'session', template_name TEXT, template_params JSONB, status TEXT CHECK(4 values) DEFAULT 'pending', attempts INT DEFAULT 0, last_attempted_at TIMESTAMPTZ, error TEXT, scheduled_at TIMESTAMPTZ DEFAULT NOW(), lead_id UUID FK→leads(id) ON DELETE SET NULL, metadata JSONB DEFAULT '{}' |
| `campaigns` | `002:45-66` | id UUID PK, created_at, completed_at, type TEXT NOT NULL, segment/template_name TEXT, recipient_count/success_count/failed_count INT DEFAULT 0, status TEXT CHECK(4 values) DEFAULT 'pending', custom_message/notes TEXT, created_by TEXT DEFAULT 'admin', metadata JSONB DEFAULT '{}' |
| `proposals` | `003:9-57` | id UUID PK, created_at/updated_at, lead_id UUID FK→leads(id) ON DELETE CASCADE, proposal_number TEXT UNIQUE, client_name/phone/email TEXT, event_type TEXT, event_date DATE, event_time TEXT, guest_count INT, venue/package_name TEXT, base_price NUMERIC(10,2), addons JSONB DEFAULT '[]', discount_amount NUMERIC(10,2) DEFAULT 0, discount_reason TEXT, total_price/advance_required NUMERIC(10,2), special_requirements TEXT, inclusions TEXT[], notes TEXT, status TEXT CHECK(6 values, extended to 8 in migration 010) DEFAULT 'draft', sent_at/viewed_at/accepted_at/expires_at TIMESTAMPTZ, ai_cover_note TEXT, pdf_path TEXT, created_by TEXT DEFAULT 'admin'. Later extended (see below). |
| `bookings` | `003:73-101` | id UUID PK, created_at/updated_at, lead_id UUID FK→leads(id) ON DELETE SET NULL, proposal_id UUID FK→proposals(id) ON DELETE SET NULL, event_date DATE NOT NULL, event_time/event_end_time TEXT, venue TEXT NOT NULL, client_name/phone TEXT, event_type TEXT, guest_count INT, package_name TEXT, total_price NUMERIC(10,2), advance_paid NUMERIC(10,2) DEFAULT 0, balance_due NUMERIC(10,2), status TEXT CHECK(4 values) DEFAULT 'confirmed', google_calendar_event_id TEXT, notes TEXT, created_by TEXT DEFAULT 'admin' |
| `blocked_dates` | `003:143-150` | id UUID PK, created_at, date DATE NOT NULL, venue TEXT NOT NULL, reason TEXT, booking_id UUID FK→bookings(id) ON DELETE CASCADE. UNIQUE INDEX(date, venue) at line 152. |
| `broadcast_campaigns` | `004:9-41` | id UUID PK, created_at/scheduled_at/sent_at, name TEXT NOT NULL, type TEXT CHECK(6 values) NOT NULL, channel TEXT CHECK(3 values) DEFAULT 'whatsapp', segment JSONB DEFAULT '{}', recipient_count INT DEFAULT 0, message_template TEXT NOT NULL, template_name TEXT, variables JSONB DEFAULT '[]', status TEXT CHECK(5 values) DEFAULT 'draft', sent/delivered/failed/reply/conversion_count INT DEFAULT 0, created_by TEXT DEFAULT 'admin', notes TEXT |
| `ai_summaries` | `004:50-63` | id UUID PK, created_at, date DATE NOT NULL UNIQUE, summary_text TEXT NOT NULL, key_metrics JSONB DEFAULT '{}', action_items/vip_leads/urgent_followups JSONB DEFAULT '[]', sent_via_whatsapp/sent_via_email BOOL DEFAULT FALSE |
| `festival_calendar` | `004:73-81` | id UUID PK, name TEXT NOT NULL, date DATE NOT NULL, type TEXT CHECK(3 values) DEFAULT 'major', campaign_message TEXT, days_before_alert INT DEFAULT 7, auto_campaign BOOL DEFAULT FALSE. Seeded with 18 rows of 2026 Indian festivals (`004:90-109`). |
| `staff_performance` | `004:124-138` | id UUID PK, created_at, week_start DATE NOT NULL, staff_name TEXT NOT NULL, leads_handled/leads_converted/proposals_sent/followups_done INT DEFAULT 0, avg_response_time_minutes INT, revenue_generated NUMERIC(10,2) DEFAULT 0. UNIQUE(week_start, staff_name). |
| `notification_settings` | `004:147-152` | id UUID PK, key TEXT UNIQUE NOT NULL, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(). Seeded 7 key/value rows including `daily_summary_whatsapp = '9051459463'` (`004:157`, re-seeded identically in `005:323` and `006:252`) — a hardcoded personal/business phone number embedded directly in migration SQL. |
| `follow_ups` | `007:20-36` | id UUID PK, created_at/updated_at, lead_id UUID NOT NULL FK→leads(id) ON DELETE CASCADE, scheduled_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ, type TEXT CHECK(6 values) DEFAULT 'call', notes TEXT, status TEXT CHECK(4 values) DEFAULT 'pending', assigned_to TEXT DEFAULT 'team', created_by TEXT DEFAULT 'system' |
| `analytics_events` | `007:56-70` | id UUID PK, created_at, event_type TEXT NOT NULL, session_id TEXT, lead_id UUID FK→leads(id) ON DELETE SET NULL, channel TEXT CHECK(4 values) DEFAULT 'website', properties JSONB DEFAULT '{}', event_key TEXT UNIQUE (null-safe) |
| `escalations` | `007:86-106` | id UUID PK, created_at/resolved_at, conversation_id UUID FK→conversations(id) ON DELETE SET NULL, lead_id UUID FK→leads(id) ON DELETE SET NULL, reason TEXT NOT NULL, trigger_message TEXT, channel TEXT CHECK(2 values) DEFAULT 'website', status TEXT CHECK(4 values) DEFAULT 'open', assigned_to/resolution_notes TEXT, lead_name/lead_phone/summary TEXT |
| `packages` | `007:122-147` | id UUID PK, created_at/updated_at, name TEXT NOT NULL, venue TEXT NOT NULL, tier INT DEFAULT 1, base_price NUMERIC(10,2) NOT NULL, max_guests INT DEFAULT 60, duration_hours INT DEFAULT 4, inclusions TEXT[] DEFAULT '{}', addons JSONB DEFAULT '[]', description TEXT, is_active BOOL DEFAULT TRUE, is_popular BOOL DEFAULT FALSE, ai_description TEXT. Seeded with Silver (₹42,000) / Gold (₹50,000, is_popular) / Platinum (₹59,500) for `monurama_rooftop` at `007:170-190`. |

## Views created (7 total)

| View | Created in | Notes |
|---|---|---|
| `leads_needing_followup` | `002:90` (CREATE OR REPLACE) | Redefined 2 more times: `005:253` (DROP VIEW + CREATE, hardened with `COALESCE`/`ROUND`), `006:209` (DROP VIEW + CREATE, same definition as 005). VERIFIED 3 separate definitions of the same view exist across migration history — the 006 version is the one that would be live on a fully-migrated database, and it is identical to the 005 version. |
| `hot_leads` | `008:52` (CREATE OR REPLACE) | Selects leads WHERE `lead_temperature = 'HOT'`, ordered by `ai_score DESC, created_at DESC`. |
| `lead_scoring_summary` | `008:80` (CREATE OR REPLACE) | Aggregate by `lead_temperature, urgency_level`. |
| `proposal_intelligence_view` | `010:145` (CREATE OR REPLACE) | Joins `proposals p LEFT JOIN leads l ON l.id = p.lead_id`. Selects `l.lead_stage` at line 200 — see "Column referenced but never created" below. |
| `proposal_urgency_summary` | `010:258` (CREATE OR REPLACE) | Aggregate KPI counts over `proposals`. |

## Functions and triggers

VERIFIED functions: `update_updated_at_column()` (`001:183`, redefined `006:23`), `match_knowledge_chunks(...)` (`001:200`, redefined `005:285`, redefined `006:226`), `generate_proposal_number()` (`003:115`), `track_event(...)` (`007:231`, wrapped in `EXCEPTION WHEN others THEN NULL` at line 245 — analytics failures are deliberately swallowed), `handle_conversation_escalation()` (`007:255`).

VERIFIED triggers: `update_leads_updated_at`, `update_conversations_updated_at` (`001:191,195`, each re-created with `DROP TRIGGER IF EXISTS` in `005:193-208` and again in `006:163-176` — idempotent re-declaration across migrations, not a bug but confirms iterative patching), `set_proposal_number` (`003:125`), `update_proposals_updated_at` (`003:59`, re-created `005:194`, `006:174`), `update_follow_ups_updated_at` (`007:43`), `update_packages_updated_at` (`007:153`), `on_conversation_escalated` (`007:288`, fires `AFTER UPDATE ON conversations WHEN (NEW.is_escalated = TRUE)`).

## Row Level Security

VERIFIED — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements exist for exactly 18 of the 19 created tables: `leads, conversations, knowledge_chunks, documents, activity_logs` (`001:235-239`), `message_queue` (`002:38`), `campaigns` (`002:68`), `proposals` (`003:66`), `bookings` (`003:106`), `blocked_dates` (`003:154`), `broadcast_campaigns` (`004:43`), `ai_summaries` (`004:65`), `festival_calendar` (`004:83`), `staff_performance` (`004:140`), `follow_ups` (`007:47`), `analytics_events` (`007:77`), `escalations` (`007:112`), `packages` (`007:157`).

**VERIFIED GAP — `notification_settings` (created `004:147`) never receives `ENABLE ROW LEVEL SECURITY` in any of the 9 migration files.** A cross-file grep for `ENABLE ROW LEVEL SECURITY` across all 9 files returns exactly 18 matches (listed above); `notification_settings` is not among them. Despite this, a policy IS created for it: `CREATE POLICY "notification_settings_service_role_all" ON notification_settings FOR ALL USING (auth.role() = 'service_role')` at `005:148`. A Postgres policy on a table where RLS is not enabled has no effect — the table has no row-level access control at all (equivalent to fully open, subject only to whatever grants exist at the Postgres role level).

## CREATE POLICY statements — full inventory

VERIFIED counts per file (via `grep -c "CREATE POLICY"`): `001`→8, `002`→2, `003`→4, `004`→5, `005`→21, `006`→0, `007`→5, `008`→0, `010`→1. Total 46 `CREATE POLICY` statements across the history (note: `005` both drops and recreates most policies from `001`-`004` under new unique names, so the live policy set on a fully-migrated DB is smaller than 46 — the 005 migration's own stated purpose, `005:1-13` header comment, is "Fixes duplicate RLS policy names").

Anon-accessible policies (non-service-role), VERIFIED:
- `leads`: `FOR INSERT WITH CHECK (TRUE)` — `001:254`, renamed `leads_anon_insert` in `005:82-83`.
- `conversations`: `FOR INSERT WITH CHECK (TRUE)` (`001:256`, `005:88-89`) AND `FOR UPDATE USING (TRUE)` (`001:258-259`, renamed `conversations_anon_update` in `005:90-91`) — the UPDATE policy has no scoping condition; any anonymous client can update any row in `conversations`.
- `knowledge_chunks`: `FOR SELECT USING (TRUE)` — `005:96-97` (`knowledge_chunks_anon_read`).
- `blocked_dates`: `FOR SELECT USING (TRUE)` — `003:157`, `005:126-127`.
- `festival_calendar`: `FOR SELECT USING (TRUE)` — `004:86-87`, `005:140-141`.
- `packages`: `FOR SELECT USING (TRUE)` — `007:162-164` (`packages_anon_read`).

## Indexes

VERIFIED counts of `CREATE INDEX`/`CREATE UNIQUE INDEX` per file: `001`→9, `002`→3, `003`→5, `004`→0, `005`→20, `006`→20, `007`→14, `008`→5, `010`→6. Many are re-declarations of the same index name with `IF NOT EXISTS` across later migrations (idempotent patching pattern, consistent with the "safe to re-run" comments at the top of files 005-010). A dedicated HNSW vector index on `knowledge_chunks.embedding` is created/redeclared in `001:175-176`, `005:240-242`, `006:201-203`.

## Columns added via ALTER TABLE (not part of original CREATE TABLE)

VERIFIED — `leads` gained columns across multiple migrations: `whatsapp_opted_in, whatsapp_last_message_at, campaign_tags` (`003:76-78`), `ai_score, ai_score_reason, ai_scored_at, booking_probability, event_time, calendar_event_id` (`003:133-138`), `is_vip, vip_reason, lifetime_value, referral_source, repeat_customer` (`004:114-119`), `lead_temperature, urgency_level, estimated_revenue, score_breakdown, scored_at` (`008:14-25`). `proposals` gained `updated_at` (`005:185`) and, extensively, `generated_at, first_viewed_at, last_viewed_at, followed_up_at, rejected_at, viewed_count, engagement_score, share_token, urgency_score, risk_level, next_action, recommendation, escalation_required, ai_summary, recommended_package, venue_fit_reasoning, upsell_suggestions, urgency_cta, confidence_score` (`010:56-107`). `activity_logs` gained `channel` (`003:83-84`, re-added defensively `007:213-214`), `metadata`, `performed_by` (`007:213-214`).

## Tables/views referenced in application code but ABSENT from every migration (VERIFIED)

A case-insensitive, whole-word grep for each of the following identifiers across all 9 `supabase/migrations/*.sql` files AND the root-level duplicate `007_missing_tables.sql` returned **zero matches** for all of them:

- **`payments`** — referenced in `src/app/api/proposals/[id]/invoice/route.ts`, `src/app/api/proposals/[id]/payment/route.ts`, `src/app/api/proposals/[id]/receipt/route.ts`.
- **`invoices`** — referenced in `src/app/api/proposals/[id]/invoice/route.ts` (lines 458, 468, 485 per the earlier route scan).
- **`user_profiles`** — referenced in `src/app/api/admin/users/route.ts:47,55,102` (see AUTH_AUDIT.md).
- **`active_users_view`** — referenced in `src/app/api/admin/users/route.ts:19`.
- **`lead_imports`** — referenced in `src/app/api/leads/import/route.ts`.

VERIFIED — a sixth identifier, **`leads.lead_stage`** (a column, not a table), is referenced extensively in application code — `src/app/api/dashboard/stats/route.ts:38,56,57,67,80,82`, `src/app/api/leads/hot/route.ts:44`, `src/app/api/proposals/intelligence/route.ts:33,64,124`, `src/modules/leads/lead-stage-manager.ts` (multiple lines, e.g. 45, 87, 95, 110, 147), `src/modules/leads/types.ts:67,155`, `src/modules/automation/escalation-engine.ts:49,59` — and is also selected by the `proposal_intelligence_view` (`010:200`, `l.lead_stage`) — but no `ALTER TABLE leads ADD COLUMN lead_stage` (or equivalent) statement exists in any of the 9 migrations (VERIFIED via `grep -n "lead_stage" supabase/migrations/*.sql`, the only match is the view's `SELECT` reference at `010:200`, not a column-creation statement).

This means either: (a) `lead_stage` and the five table/view names above were created manually outside the migration files (e.g. directly in the Supabase SQL editor or dashboard, undocumented schema drift relative to this repository), or (b) these code paths would fail at runtime against a database built strictly from the migrations in this repo. Which of these is true is NOT VERIFIED from static code alone — it would require connecting to the live database, which is out of scope for this read-only file-system audit. Some call sites defensively guard against this (`src/app/api/leads/hot/route.ts:44`: `(row as Record<string, unknown>).lead_stage ?? null`, with a comment at line 18 "safe to omit if missing"), which is itself evidence the original author was aware this column might not be present.

## UNINSPECTED ITEMS (Part 4 scope)

None — all 9 migration files plus the confirmed-duplicate root `007_missing_tables.sql` were read in full.
