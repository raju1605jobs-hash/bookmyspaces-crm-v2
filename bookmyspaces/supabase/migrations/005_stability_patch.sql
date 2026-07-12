-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES — PATCH MIGRATION (Run after 001–004)
-- File: 005_stability_patch.sql
--
-- Fixes all schema inconsistencies found during production audit:
-- 1. Duplicate RLS policy names (idempotent DROP + CREATE)
-- 2. Missing columns referenced by application code
-- 3. event_date type handling
-- 4. campaigns vs broadcast_campaigns consolidation
-- 5. Missing triggers
-- 6. Missing indexes
-- 7. Hardened leads_needing_followup view
-- 8. Safe re-runnable structure throughout
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- SECTION 1: DROP DUPLICATE POLICY NAMES
-- Supabase errors when policy name already exists on a table.
-- We DROP then recreate with unique names per table.
-- ─────────────────────────────────────────

-- leads
DROP POLICY IF EXISTS "Service role full access" ON leads;
DROP POLICY IF EXISTS "Anon can insert leads" ON leads;
DROP POLICY IF EXISTS "Anon can update leads" ON leads;

-- conversations
DROP POLICY IF EXISTS "Service role full access" ON conversations;
DROP POLICY IF EXISTS "Anon can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Anon can update own conversations" ON conversations;

-- knowledge_chunks
DROP POLICY IF EXISTS "Service role full access" ON knowledge_chunks;

-- documents
DROP POLICY IF EXISTS "Service role full access" ON documents;

-- activity_logs
DROP POLICY IF EXISTS "Service role full access" ON activity_logs;

-- message_queue
DROP POLICY IF EXISTS "Service role full access" ON message_queue;

-- campaigns (phase 2 table)
DROP POLICY IF EXISTS "Service role full access" ON campaigns;

-- proposals
DROP POLICY IF EXISTS "Service role full access" ON proposals;

-- bookings
DROP POLICY IF EXISTS "Service role full access" ON bookings;

-- blocked_dates
DROP POLICY IF EXISTS "Service role full access" ON blocked_dates;
DROP POLICY IF EXISTS "Anon can read blocked dates" ON blocked_dates;

-- broadcast_campaigns (phase 4 table)
DROP POLICY IF EXISTS "Service role full access" ON broadcast_campaigns;

-- ai_summaries
DROP POLICY IF EXISTS "Service role full access" ON ai_summaries;

-- festival_calendar
DROP POLICY IF EXISTS "Service role full access" ON festival_calendar;
DROP POLICY IF EXISTS "Anon can read festivals" ON festival_calendar;

-- staff_performance
DROP POLICY IF EXISTS "Service role full access" ON staff_performance;

-- notification_settings
DROP POLICY IF EXISTS "Service role full access" ON notification_settings;


-- ─────────────────────────────────────────
-- SECTION 2: RECREATE RLS POLICIES
-- Unique names per table to prevent future collisions.
-- ─────────────────────────────────────────

-- leads: service role + anon chatbot access
CREATE POLICY "leads_service_role_all" ON leads
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "leads_anon_insert" ON leads
  FOR INSERT WITH CHECK (TRUE);

-- conversations: service role + anon chatbot access
CREATE POLICY "conversations_service_role_all" ON conversations
  FOR ALL USING (auth.role() = 'service_role');
-- ISS-008 (audit/MASTER_ISSUE_REGISTER.csv): the two anon policies below are
-- STALE — confirmed absent from the live production policy list during the
-- Phase 0 schema reconciliation (see audit/MIGRATION_REVIEW.md, statement
-- #17, and the defensive DROP POLICY statements for these exact two names in
-- supabase/migrations/009_document_undocumented_production_objects.sql).
-- They were removed live at some point without this source file being
-- updated to match, so re-running this file against a fresh database used to
-- recreate access production no longer grants. Commented out (not deleted)
-- so the migration history stays legible; matches ISS-001/002's tightened
-- posture of requiring a real session for conversation writes instead of
-- open anon INSERT/UPDATE.
-- CREATE POLICY "conversations_anon_insert" ON conversations
--   FOR INSERT WITH CHECK (TRUE);
-- CREATE POLICY "conversations_anon_update" ON conversations
--   FOR UPDATE USING (TRUE);

-- knowledge_chunks
CREATE POLICY "knowledge_chunks_service_role_all" ON knowledge_chunks
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "knowledge_chunks_anon_read" ON knowledge_chunks
  FOR SELECT USING (TRUE);

-- documents
CREATE POLICY "documents_service_role_all" ON documents
  FOR ALL USING (auth.role() = 'service_role');

-- activity_logs (service role only — inserted server-side)
CREATE POLICY "activity_logs_service_role_all" ON activity_logs
  FOR ALL USING (auth.role() = 'service_role');

-- message_queue
CREATE POLICY "message_queue_service_role_all" ON message_queue
  FOR ALL USING (auth.role() = 'service_role');

-- campaigns (phase 2 simple table)
CREATE POLICY "campaigns_service_role_all" ON campaigns
  FOR ALL USING (auth.role() = 'service_role');

-- proposals
CREATE POLICY "proposals_service_role_all" ON proposals
  FOR ALL USING (auth.role() = 'service_role');

-- bookings
CREATE POLICY "bookings_service_role_all" ON bookings
  FOR ALL USING (auth.role() = 'service_role');

-- blocked_dates (public read — chatbot can check availability)
CREATE POLICY "blocked_dates_service_role_all" ON blocked_dates
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "blocked_dates_anon_read" ON blocked_dates
  FOR SELECT USING (TRUE);

-- broadcast_campaigns
CREATE POLICY "broadcast_campaigns_service_role_all" ON broadcast_campaigns
  FOR ALL USING (auth.role() = 'service_role');

-- ai_summaries
CREATE POLICY "ai_summaries_service_role_all" ON ai_summaries
  FOR ALL USING (auth.role() = 'service_role');

-- festival_calendar (public read)
CREATE POLICY "festival_calendar_service_role_all" ON festival_calendar
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "festival_calendar_anon_read" ON festival_calendar
  FOR SELECT USING (TRUE);

-- staff_performance
CREATE POLICY "staff_performance_service_role_all" ON staff_performance
  FOR ALL USING (auth.role() = 'service_role');

-- notification_settings
CREATE POLICY "notification_settings_service_role_all" ON notification_settings
  FOR ALL USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────
-- SECTION 3: MISSING COLUMNS
-- All columns referenced by application code that may not exist yet.
-- Uses ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ─────────────────────────────────────────

-- leads: Phase 2 additions
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_opted_in BOOLEAN DEFAULT TRUE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_last_message_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_tags TEXT[] DEFAULT '{}';

-- leads: Phase 3 additions
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 5;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_probability INTEGER DEFAULT 50;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

-- leads: Phase 4 additions
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vip_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lifetime_value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referral_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS repeat_customer BOOLEAN DEFAULT FALSE;

-- activity_logs: Phase 2 addition
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'system';

-- conversations: ensure updated_at exists (should from 001, but guard)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- proposals: ensure updated_at exists
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();


-- ─────────────────────────────────────────
-- SECTION 4: MISSING TRIGGERS
-- ─────────────────────────────────────────

-- proposals updated_at trigger (was missing from phase 3)
DROP TRIGGER IF EXISTS update_proposals_updated_at ON proposals;
CREATE TRIGGER update_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- conversations updated_at trigger (defensive — may already exist)
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- leads updated_at trigger (defensive)
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ─────────────────────────────────────────
-- SECTION 5: MISSING INDEXES
-- ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_is_vip ON leads(is_vip) WHERE is_vip = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_ai_score ON leads(ai_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);

CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON activity_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_file);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_category ON knowledge_chunks(category);

-- Vector similarity index (HNSW — best for pgvector)
DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);


-- ─────────────────────────────────────────
-- SECTION 6: HARDENED LEADS_NEEDING_FOLLOWUP VIEW
-- Replaces the one from migration 002.
-- Now safe even if whatsapp_opted_in column doesn't exist yet.
-- ─────────────────────────────────────────

DROP VIEW IF EXISTS leads_needing_followup;

CREATE VIEW leads_needing_followup AS
SELECT
  id,
  name,
  phone,
  email,
  event_type,
  event_date,
  status,
  source,
  last_contacted_at,
  created_at,
  ROUND(
    EXTRACT(EPOCH FROM (NOW() - COALESCE(last_contacted_at, created_at))) / 3600
  ) AS hours_since_contact
FROM leads
WHERE
  status IN ('new_inquiry', 'followup_pending', 'future_prospect')
  AND phone IS NOT NULL
  AND phone != ''
  AND (
    last_contacted_at IS NULL
    OR last_contacted_at < NOW() - INTERVAL '24 hours'
  )
ORDER BY hours_since_contact DESC;


-- ─────────────────────────────────────────
-- SECTION 7: SAFE MATCH FUNCTION (recreate)
-- Ensures the RAG search function exists and is correct.
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_file TEXT,
  category TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    knowledge_chunks.id,
    knowledge_chunks.content,
    knowledge_chunks.source_file,
    knowledge_chunks.category,
    1 - (knowledge_chunks.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE 1 - (knowledge_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY knowledge_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- ─────────────────────────────────────────
-- SECTION 8: NOTIFICATION SETTINGS DEFAULTS
-- Upsert — safe to re-run, won't overwrite existing values.
-- ─────────────────────────────────────────

INSERT INTO notification_settings (key, value) VALUES
  ('daily_summary_enabled', 'true'),
  ('daily_summary_time', '08:00'),
  ('daily_summary_whatsapp', '9051459463'),
  ('vip_threshold_score', '8'),
  ('vip_threshold_budget', '50000'),
  ('alert_new_lead_whatsapp', 'true'),
  ('festival_campaign_auto', 'false')
ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────
-- SECTION 9: VERIFY — Query to confirm setup
-- Run this after the migration to check everything worked.
-- ─────────────────────────────────────────

-- Uncomment and run manually to verify:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;

-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'leads' ORDER BY ordinal_position;

-- SELECT policyname, tablename FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename;
