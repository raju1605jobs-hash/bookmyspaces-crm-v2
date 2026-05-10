-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES — FINAL COMPLETE SCHEMA
-- File: 006_final_verification.sql
--
-- PURPOSE: Final verification + any remaining gaps.
-- SAFE TO RUN: Fully idempotent. Re-runnable without errors.
--
-- Run this LAST, after 001–005.
-- If starting fresh on a new Supabase project, run 001–005 first,
-- then this file.
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- VERIFY: Required extensions
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─────────────────────────────────────────
-- VERIFY: update_updated_at_column function exists
-- (Required by triggers — recreate safely)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ─────────────────────────────────────────
-- ARCHITECTURE DECISION (documented)
-- ─────────────────────────────────────────
-- Messages are stored as JSONB array inside conversations.messages
-- There is NO separate messages table — this is intentional.
-- Format: [{role: 'user'|'assistant', content: string, timestamp: string}]
-- This avoids join complexity for a chat-first application.
-- ─────────────────────────────────────────

-- ─────────────────────────────────────────
-- VERIFY: All leads columns
-- ─────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS guest_count INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS special_requirements TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sheets_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sheets_row_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS inquiry_summary TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 5;
-- Phase 2
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_opted_in BOOLEAN DEFAULT TRUE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_last_message_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_tags TEXT[] DEFAULT '{}';
-- Phase 3
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 5;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_probability INTEGER DEFAULT 50;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
-- Phase 4
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vip_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lifetime_value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referral_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS repeat_customer BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────
-- VERIFY: conversations columns
-- ─────────────────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'website';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS extracted_name TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS extracted_phone TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS extracted_email TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS extracted_event_type TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS extracted_event_date TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS extracted_guest_count TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS extracted_budget TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─────────────────────────────────────────
-- VERIFY: activity_logs columns
-- ─────────────────────────────────────────
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS performed_by TEXT DEFAULT 'system';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'system';

-- ─────────────────────────────────────────
-- VERIFY: proposals columns
-- ─────────────────────────────────────────
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS proposal_number TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS guest_count INTEGER;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS package_name TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS discount_reason TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS advance_required NUMERIC(10,2);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS special_requirements TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS inclusions TEXT[];
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ai_cover_note TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pdf_path TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'admin';

-- ─────────────────────────────────────────
-- UNIQUE INDEX: conversations.session_id
-- (Required for chatbot — must be unique)
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'conversations' AND indexname = 'conversations_session_id_key'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX conversations_session_id_key ON conversations(session_id);
    EXCEPTION WHEN others THEN
      -- Index may already exist or session_id may have nulls — skip
    END;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- ALL TRIGGERS (idempotent)
-- ─────────────────────────────────────────
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_proposals_updated_at ON proposals;
CREATE TRIGGER update_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────
-- ALL INDEXES (idempotent)
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_leads_ai_score ON leads(ai_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_is_vip ON leads(is_vip) WHERE is_vip = TRUE;
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON activity_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_category ON knowledge_chunks(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_file);

-- Vector index (HNSW — recreate safely)
DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- ─────────────────────────────────────────
-- HARDENED FOLLOWUP VIEW
-- ─────────────────────────────────────────
DROP VIEW IF EXISTS leads_needing_followup;
CREATE VIEW leads_needing_followup AS
SELECT
  id, name, phone, email, event_type, event_date,
  status, source, last_contacted_at, created_at,
  ROUND(
    EXTRACT(EPOCH FROM (NOW() - COALESCE(last_contacted_at, created_at))) / 3600
  ) AS hours_since_contact
FROM leads
WHERE
  status IN ('new_inquiry', 'followup_pending', 'future_prospect')
  AND phone IS NOT NULL AND phone != ''
  AND (last_contacted_at IS NULL OR last_contacted_at < NOW() - INTERVAL '24 hours')
ORDER BY hours_since_contact DESC;

-- ─────────────────────────────────────────
-- RAG MATCH FUNCTION
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 5
)
RETURNS TABLE (id UUID, content TEXT, source_file TEXT, category TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    knowledge_chunks.id, knowledge_chunks.content,
    knowledge_chunks.source_file, knowledge_chunks.category,
    1 - (knowledge_chunks.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE 1 - (knowledge_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY knowledge_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─────────────────────────────────────────
-- NOTIFICATION SETTINGS DEFAULTS
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
-- VERIFICATION QUERIES
-- Run these after migration to confirm everything worked.
-- ─────────────────────────────────────────

-- 1. Check all tables exist:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;

-- 2. Check leads has all required columns:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'leads' ORDER BY ordinal_position;

-- 3. Check all triggers:
-- SELECT trigger_name, event_object_table FROM information_schema.triggers
-- WHERE trigger_schema = 'public';

-- 4. Check all policies:
-- SELECT policyname, tablename FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- 5. Check knowledge chunks (should be > 0 after seeding):
-- SELECT COUNT(*) FROM knowledge_chunks;

-- 6. Quick health check:
-- SELECT 'leads' as tbl, COUNT(*) FROM leads
-- UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
-- UNION ALL SELECT 'activity_logs', COUNT(*) FROM activity_logs
-- UNION ALL SELECT 'knowledge_chunks', COUNT(*) FROM knowledge_chunks
-- UNION ALL SELECT 'proposals', COUNT(*) FROM proposals;
