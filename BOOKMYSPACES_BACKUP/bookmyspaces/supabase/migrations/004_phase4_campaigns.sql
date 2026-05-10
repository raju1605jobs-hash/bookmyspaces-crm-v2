-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES — PHASE 4 SCHEMA
-- Run AFTER 003_phase3_proposals.sql
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- BROADCAST CAMPAIGNS (enhanced)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'festival', 'followup', 'reengagement',
    'offer', 'review_request', 'custom'
  )),
  channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email', 'both')),

  -- Targeting
  segment JSONB DEFAULT '{}',  -- {status, source, min_score, event_type, venue}
  recipient_count INTEGER DEFAULT 0,

  -- Content
  message_template TEXT NOT NULL,
  template_name TEXT,           -- WhatsApp approved template name
  variables JSONB DEFAULT '[]', -- template variable mappings

  -- Results
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'failed')),
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  conversion_count INTEGER DEFAULT 0,

  created_by TEXT DEFAULT 'admin',
  notes TEXT
);

ALTER TABLE broadcast_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON broadcast_campaigns
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- AI DAILY SUMMARIES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  date DATE NOT NULL UNIQUE,
  summary_text TEXT NOT NULL,
  key_metrics JSONB DEFAULT '{}',
  action_items JSONB DEFAULT '[]',
  vip_leads JSONB DEFAULT '[]',
  urgent_followups JSONB DEFAULT '[]',

  sent_via_whatsapp BOOLEAN DEFAULT FALSE,
  sent_via_email BOOLEAN DEFAULT FALSE
);

ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON ai_summaries
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- FESTIVAL CALENDAR
-- Pre-loaded with Indian festivals for 2026
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS festival_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT DEFAULT 'major' CHECK (type IN ('major', 'regional', 'corporate')),
  campaign_message TEXT,
  days_before_alert INTEGER DEFAULT 7,
  auto_campaign BOOLEAN DEFAULT FALSE
);

ALTER TABLE festival_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON festival_calendar
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anon can read festivals" ON festival_calendar
  FOR SELECT USING (TRUE);

-- Seed 2026 Indian festivals
INSERT INTO festival_calendar (name, date, type, days_before_alert, auto_campaign) VALUES
  ('Makar Sankranti', '2026-01-14', 'major', 7, false),
  ('Republic Day', '2026-01-26', 'major', 3, false),
  ('Valentine''s Day', '2026-02-14', 'major', 10, false),
  ('Holi', '2026-03-02', 'major', 10, true),
  ('Eid ul-Fitr', '2026-03-20', 'major', 7, false),
  ('Ram Navami', '2026-03-26', 'regional', 5, false),
  ('Good Friday', '2026-04-03', 'major', 3, false),
  ('Eid ul-Adha', '2026-05-27', 'major', 7, false),
  ('Independence Day', '2026-08-15', 'major', 7, false),
  ('Janmashtami', '2026-08-23', 'major', 7, true),
  ('Ganesh Chaturthi', '2026-09-11', 'major', 10, true),
  ('Navratri', '2026-09-29', 'major', 10, false),
  ('Dussehra', '2026-10-08', 'major', 7, false),
  ('Diwali', '2026-10-28', 'major', 14, true),
  ('Bhai Dooj', '2026-10-30', 'regional', 5, false),
  ('Chhath Puja', '2026-11-02', 'regional', 5, false),
  ('Christmas', '2026-12-25', 'major', 10, true),
  ('New Year''s Eve', '2026-12-31', 'major', 7, true)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────
-- VIP LEAD FLAGS
-- ─────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vip_reason TEXT,
  ADD COLUMN IF NOT EXISTS lifetime_value NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_source TEXT,
  ADD COLUMN IF NOT EXISTS repeat_customer BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────
-- STAFF PERFORMANCE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  week_start DATE NOT NULL,
  staff_name TEXT NOT NULL,

  leads_handled INTEGER DEFAULT 0,
  leads_converted INTEGER DEFAULT 0,
  proposals_sent INTEGER DEFAULT 0,
  followups_done INTEGER DEFAULT 0,
  avg_response_time_minutes INTEGER,
  revenue_generated NUMERIC(10,2) DEFAULT 0,

  UNIQUE(week_start, staff_name)
);

ALTER TABLE staff_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON staff_performance
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- NOTIFICATION SETTINGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO notification_settings (key, value) VALUES
  ('daily_summary_enabled', 'true'),
  ('daily_summary_time', '08:00'),
  ('daily_summary_whatsapp', '9051459463'),
  ('vip_threshold_score', '8'),
  ('vip_threshold_budget', '50000'),
  ('alert_new_lead_whatsapp', 'true'),
  ('festival_campaign_auto', 'false')
ON CONFLICT (key) DO NOTHING;
