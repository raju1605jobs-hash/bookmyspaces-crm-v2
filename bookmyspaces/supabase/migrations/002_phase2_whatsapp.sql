-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES — PHASE 2 SCHEMA ADDITIONS
-- Run AFTER 001_initial_schema.sql
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- MESSAGE QUEUE TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'session' CHECK (type IN ('session', 'template')),
  template_name TEXT,
  template_params JSONB,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  error TEXT,

  -- Scheduling
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),

  -- Context
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_message_queue_phone ON message_queue(phone);
CREATE INDEX IF NOT EXISTS idx_message_queue_status ON message_queue(status);
CREATE INDEX IF NOT EXISTS idx_message_queue_scheduled_at ON message_queue(scheduled_at);

-- RLS
ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON message_queue
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- CAMPAIGNS TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  type TEXT NOT NULL, -- 'followup' | 'festival' | 'reengagement' | 'review_request'
  segment TEXT,
  template_name TEXT,

  -- Results
  recipient_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- Content (for session campaigns)
  custom_message TEXT,
  notes TEXT,

  created_by TEXT DEFAULT 'admin',
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON campaigns
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- ADD WHATSAPP FIELDS TO LEADS
-- ─────────────────────────────────────────
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS whatsapp_last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_tags TEXT[] DEFAULT '{}';

-- ─────────────────────────────────────────
-- ADD CHANNEL TO ACTIVITY LOGS
-- ─────────────────────────────────────────
ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'system';

-- ─────────────────────────────────────────
-- FOLLOW-UP AUTOMATION VIEW
-- Shows leads that need follow-up
-- ─────────────────────────────────────────
CREATE OR REPLACE VIEW leads_needing_followup AS
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
  CASE 
    WHEN last_contacted_at IS NULL THEN 
      EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600
    ELSE 
      EXTRACT(EPOCH FROM (NOW() - last_contacted_at)) / 3600
  END AS hours_since_contact
FROM leads
WHERE 
  status IN ('new_inquiry', 'followup_pending', 'future_prospect')
  AND phone IS NOT NULL
  AND whatsapp_opted_in = TRUE
  AND (
    last_contacted_at IS NULL 
    OR last_contacted_at < NOW() - INTERVAL '24 hours'
  )
ORDER BY hours_since_contact DESC;
