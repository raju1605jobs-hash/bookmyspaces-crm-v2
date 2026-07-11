-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES — 009 DOCUMENT UNDOCUMENTED PRODUCTION OBJECTS
--
-- Fills the missing migration-009 slot (ISS-011). This migration does NOT
-- change production behavior for anything that already exists live. It
-- documents 10 tables, 3 views, and 9 lead columns that already exist live
-- but were never captured in any migration file (see
-- audit/SCHEMA_DRIFT_REPORT.md, Categories A/C/E). All CREATE statements
-- are idempotent (IF NOT EXISTS / OR REPLACE) and were generated from a
-- live schema snapshot captured 2026-07-11 — column types, defaults,
-- constraints, and indexes below match the live database exactly.
--
-- Also includes two genuinely NEW changes (not just documentation):
--   - one new column, follow_ups.trigger_reason, needed for ISS-018
--   - RLS policies for two tables that had RLS enabled with zero policies
--     (analytics_events, follow_ups) — ISS-006 prerequisite. NOTE: these
--     are service_role-scoped only, matching this codebase's existing
--     convention on every other table. Supabase's service_role key
--     bypasses RLS entirely regardless of policies, so this is a
--     defensive/documentation policy, not a functional access grant. It
--     does NOT by itself give a future session-scoped authenticated
--     client access to these two tables -- that still needs its own
--     policy once ISS-006's route migration reaches them.
--   - drops 4 stale anon RLS policies that migrations still define but
--     that are already absent in production — ISS-008. Confirmed via live
--     query that none of these 4 policies currently exist; these DROP
--     statements are no-ops against current production and only matter if
--     this migration is ever run against an older/fresh environment that
--     still has migrations 001-008 applied without this fix.
--
-- NOT included: CREATE OR REPLACE FUNCTION for assign_invoice_number,
-- assign_receipt_number, sync_proposal_payment_status, update_updated_at.
-- These 4 functions already exist live and 4 of the CREATE TRIGGER
-- statements below depend on them by name, but this migration was written
-- from a schema snapshot that did not capture function source (only name
-- + return type). Redefining a working production function from a guess
-- would violate the "never fabricate code" rule. Run the following against
-- the live DB to capture their real source before adding a follow-up
-- migration that version-controls them:
--   select proname, pg_get_functiondef(oid) from pg_proc
--   where proname in ('assign_invoice_number','assign_receipt_number',
--                      'sync_proposal_payment_status','update_updated_at')
--   and pronamespace = 'public'::regnamespace;
--
-- *** WARNING — PRODUCTION-ONLY SAFE, NOT FRESH-DATABASE SAFE ***
-- The 4 CREATE TRIGGER statements for trg_invoice_number, trg_receipt_number,
-- trg_sync_payment_status, and update_scheduled_jobs_updated_at call the 4
-- undocumented functions above. This migration is verified safe against the
-- CURRENT live production database (those functions are confirmed present
-- there via a live query). It WILL FAIL at those 4 statements if ever run
-- against a fresh/empty database (new environment, disaster recovery) until
-- the follow-up migration above captures and version-controls those 4
-- function bodies. Do not treat this migration as a complete "bootstrap a
-- new environment from scratch" script until that follow-up exists.
--
-- This entire migration is wrapped in one transaction: if any statement
-- fails, everything rolls back automatically and production is left
-- completely unchanged (all DDL used here is transactional in PostgreSQL).
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────
-- SECTION 1: TABLES (live, undocumented until now)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID,
  user_name   TEXT,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('lead','proposal','conversation','campaign','user','booking','system')),
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  description TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  INET,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_entity      ON activity_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id     ON activity_events (user_id) WHERE user_id IS NOT NULL;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_events_service_role" ON activity_events;
CREATE POLICY "activity_events_service_role" ON activity_events
  FOR ALL USING (auth.role() = 'service_role');

-- NOTE: id is NOT declared with "REFERENCES auth.users(id)" here. The live
-- foreign-key snapshot (SCHEMA_DRIFT_REPORT.md, Category D) does not show
-- an FK from user_profiles.id to auth.users, even though active_users_view
-- joins them 1:1 by id. Rather than assume Supabase's common convention
-- applies here, this is left unconstrained until confirmed with:
--   select conname from pg_constraint
--   where conrelid = 'user_profiles'::regclass and contype = 'f';
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  full_name     TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'sales'
    CHECK (role IN ('admin','manager','sales','marketing')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  timezone      TEXT DEFAULT 'Asia/Kolkata',
  language      TEXT DEFAULT 'en',
  created_by    UUID,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_active ON user_profiles (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_profiles_role   ON user_profiles (role);
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_profiles_self_read" ON user_profiles;
CREATE POLICY "user_profiles_self_read" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "user_profiles_self_update" ON user_profiles;
CREATE POLICY "user_profiles_self_update" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "user_profiles_service_role" ON user_profiles;
CREATE POLICY "user_profiles_service_role" ON user_profiles
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID NOT NULL REFERENCES proposals(id),
  invoice_number   TEXT UNIQUE,
  subtotal         NUMERIC DEFAULT 0,
  discount_amount  NUMERIC DEFAULT 0,
  tax_amount       NUMERIC DEFAULT 0,
  total_amount     NUMERIC DEFAULT 0,
  advance_received NUMERIC DEFAULT 0,
  balance_due      NUMERIC DEFAULT 0,
  status           TEXT DEFAULT 'draft',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invoices_proposal ON invoices (proposal_id);
DROP TRIGGER IF EXISTS trg_invoice_number ON invoices;
CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION assign_invoice_number();
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_invoices" ON invoices;
CREATE POLICY "auth_invoices" ON invoices
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID NOT NULL REFERENCES proposals(id),
  receipt_number   TEXT UNIQUE,
  amount           NUMERIC NOT NULL,
  payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode     TEXT NOT NULL DEFAULT 'cash',
  transaction_ref  TEXT,
  notes            TEXT,
  payment_type     TEXT NOT NULL DEFAULT 'advance',
  created_at       TIMESTAMPTZ DEFAULT now(),
  created_by       TEXT DEFAULT 'admin'
);
CREATE INDEX IF NOT EXISTS idx_payments_date     ON payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_proposal ON payments (proposal_id);
DROP TRIGGER IF EXISTS trg_receipt_number ON payments;
CREATE TRIGGER trg_receipt_number
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION assign_receipt_number();
DROP TRIGGER IF EXISTS trg_sync_payment_status ON payments;
CREATE TRIGGER trg_sync_payment_status
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_proposal_payment_status();
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_payments" ON payments;
CREATE POLICY "auth_payments" ON payments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS lead_imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  total_rows    INTEGER NOT NULL DEFAULT 0,
  valid_rows    INTEGER NOT NULL DEFAULT 0,
  invalid_rows  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  error_log     JSONB DEFAULT '[]'::jsonb,
  imported_by   UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
ALTER TABLE lead_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users manage imports" ON lead_imports;
CREATE POLICY "Authenticated users manage imports" ON lead_imports
  FOR ALL TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS messages (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id      UUID NOT NULL REFERENCES conversations(id),
  role                 TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content              TEXT NOT NULL,
  whatsapp_message_id  TEXT,
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created      ON messages (created_at DESC);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON messages;
CREATE POLICY "Service role full access" ON messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  job_type       TEXT NOT NULL,
  job_key        TEXT UNIQUE,
  scheduled_at   TIMESTAMPTZ NOT NULL,
  run_at         TIMESTAMPTZ,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 3,
  last_error     TEXT,
  next_retry_at  TIMESTAMPTZ,
  created_by     UUID,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_key              ON scheduled_jobs (job_key) WHERE job_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status_scheduled ON scheduled_jobs (scheduled_at) WHERE status = 'pending';
DROP TRIGGER IF EXISTS update_scheduled_jobs_updated_at ON scheduled_jobs;
CREATE TRIGGER update_scheduled_jobs_updated_at
  BEFORE UPDATE ON scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheduled_jobs_service_role" ON scheduled_jobs;
CREATE POLICY "scheduled_jobs_service_role" ON scheduled_jobs
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS system_health_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  service      TEXT NOT NULL,
  event        TEXT NOT NULL,
  duration_ms  INTEGER,
  status_code  INTEGER,
  message      TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_health_log_service_created ON system_health_log (service, created_at DESC);
-- RLS intentionally left disabled — matches live (system_health_log has no RLS in production).

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  phone                  TEXT NOT NULL UNIQUE,
  lead_id                UUID REFERENCES leads(id),
  source_channel         TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (source_channel IN ('WEBSITE','FACEBOOK','INSTAGRAM','UNKNOWN')),
  current_state          TEXT NOT NULL DEFAULT 'NEW_INQUIRY'
    CHECK (current_state IN ('NEW_INQUIRY','WAITING_FOR_EVENT_TYPE','WAITING_FOR_EVENT_DATE',
                              'WAITING_FOR_GUEST_COUNT','QUALIFIED','HANDOFF_TO_OPERATOR')),
  collected_name         TEXT,
  collected_event_type   TEXT,
  collected_event_date   TEXT,
  collected_guest_count  TEXT,
  assigned_to            TEXT,
  last_message_at        TIMESTAMPTZ DEFAULT now(),
  qualified_at           TIMESTAMPTZ,
  handoff_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_last_message ON whatsapp_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_lead_id      ON whatsapp_conversations (lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_state        ON whatsapp_conversations (current_state);
DROP TRIGGER IF EXISTS update_whatsapp_conversations_updated_at ON whatsapp_conversations;
CREATE TRIGGER update_whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_conversations_service_role" ON whatsapp_conversations;
CREATE POLICY "wa_conversations_service_role" ON whatsapp_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           TIMESTAMPTZ DEFAULT now(),
  lead_id              UUID REFERENCES leads(id),
  conversation_id      UUID REFERENCES whatsapp_conversations(id),
  phone                TEXT NOT NULL,
  source_channel       TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (source_channel IN ('WEBSITE','FACEBOOK','INSTAGRAM','UNKNOWN')),
  direction            TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type         TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text','image','audio','video','document','location','sticker','template','interactive','unknown')),
  message_text         TEXT,
  media_url            TEXT,
  template_name        TEXT,
  message_status       TEXT DEFAULT 'pending'
    CHECK (message_status IN ('pending','sent','delivered','read','failed')),
  whatsapp_message_id  TEXT UNIQUE,
  conversation_state   TEXT,
  raw_payload          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation_id ON whatsapp_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created_at      ON whatsapp_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_direction       ON whatsapp_messages (direction);
CREATE INDEX IF NOT EXISTS idx_wa_messages_lead_id         ON whatsapp_messages (lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_phone           ON whatsapp_messages (phone);
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_messages_service_role" ON whatsapp_messages;
CREATE POLICY "wa_messages_service_role" ON whatsapp_messages
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- SECTION 2: LEADS — undocumented columns (ISS-010, ISS-017 finding)
-- ─────────────────────────────────────────

-- NOTE: source_channel's CHECK constraint is added separately below, not
-- inline on the ADD COLUMN clause. leads.source_channel already exists live
-- with a constraint named leads_source_channel_check already attached.
-- ADD COLUMN IF NOT EXISTS with an inline CHECK is ambiguous when the
-- column already exists (whether the attached constraint is also skipped
-- is not something to assume without testing); a guarded DO block avoids
-- the ambiguity and the risk of a duplicate/renamed constraint entirely.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS escalation_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_id            UUID,
  ADD COLUMN IF NOT EXISTS created_by          UUID,
  ADD COLUMN IF NOT EXISTS updated_by          UUID,
  ADD COLUMN IF NOT EXISTS assigned_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_channel      TEXT,
  ADD COLUMN IF NOT EXISTS last_follow_up_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS next_follow_up_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS follow_up_count     INTEGER DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_source_channel_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_source_channel_check
      CHECK (source_channel IN ('WEBSITE','FACEBOOK','INSTAGRAM','UNKNOWN'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_owner_id          ON leads (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_created_by        ON leads (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_estimated_revenue ON leads (estimated_revenue DESC);
CREATE INDEX IF NOT EXISTS idx_leads_followup_date     ON leads (followup_date) WHERE followup_date IS NOT NULL;

-- ─────────────────────────────────────────
-- SECTION 3: FOLLOW_UPS — new column needed for ISS-018 integration
-- ─────────────────────────────────────────

ALTER TABLE follow_ups
  ADD COLUMN IF NOT EXISTS trigger_reason TEXT;

-- ─────────────────────────────────────────
-- SECTION 4: VIEWS (live, undocumented — definitions taken verbatim
-- from the live schema snapshot, unchanged)
-- ─────────────────────────────────────────

CREATE OR REPLACE VIEW active_users_view AS
 SELECT u.id,
    u.email,
    p.full_name,
    p.role,
    p.phone,
    p.avatar_url,
    p.is_active,
    p.last_login_at,
    p.created_at,
    count(l.id) AS assigned_leads
   FROM ((auth.users u
     JOIN user_profiles p ON ((p.id = u.id)))
     LEFT JOIN leads l ON (((l.owner_id = u.id) AND (l.lead_stage <> ALL (ARRAY['CONFIRMED'::text, 'LOST'::text])))))
  WHERE (p.is_active = true)
  GROUP BY u.id, u.email, p.full_name, p.role, p.phone, p.avatar_url, p.is_active, p.last_login_at, p.created_at
  ORDER BY p.role, p.full_name;

CREATE OR REPLACE VIEW lead_analytics AS
 SELECT date_trunc('day'::text, created_at) AS date,
    source,
    property,
    status,
    count(*) AS count,
    avg(score) AS avg_score,
    sum(
        CASE
            WHEN (status = 'Booked'::text) THEN revenue
            ELSE (0)::numeric
        END) AS revenue
   FROM leads
  GROUP BY (date_trunc('day'::text, created_at)), source, property, status;

CREATE OR REPLACE VIEW notification_summary AS
 SELECT user_id,
    count(*) AS unread_count,
    count(*) FILTER (WHERE (priority = ANY (ARRAY['high'::text, 'urgent'::text]))) AS urgent_count,
    max(created_at) AS latest_at
   FROM notifications
  WHERE ((is_read = false) AND (dismissed_at IS NULL))
  GROUP BY user_id;

-- ─────────────────────────────────────────
-- SECTION 5: ISS-006 prerequisite — RLS-enabled tables with zero
-- policies (analytics_events, follow_ups). Minimum viable service-role
-- policy for now; refine once ISS-006's ownership model is implemented.
-- ─────────────────────────────────────────

DROP POLICY IF EXISTS "analytics_events_service_role" ON analytics_events;
CREATE POLICY "analytics_events_service_role" ON analytics_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "follow_ups_service_role" ON follow_ups;
CREATE POLICY "follow_ups_service_role" ON follow_ups
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- SECTION 6: ISS-008 — drop stale anon policies that migrations still
-- define but that are already absent in production (confirmed via live
-- query). Keeps migration history consistent with the fixed production
-- state so a fresh environment doesn't reintroduce the hole.
-- ─────────────────────────────────────────

DROP POLICY IF EXISTS "Anon can insert leads" ON leads;
DROP POLICY IF EXISTS "Anon can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Anon can update own conversations" ON conversations;
DROP POLICY IF EXISTS "conversations_anon_insert" ON conversations;
DROP POLICY IF EXISTS "conversations_anon_update" ON conversations;

COMMIT;
