-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES — 007 FINAL COMPLETE SCHEMA
-- Run LAST, after 001–006
-- Safe to re-run: uses IF NOT EXISTS everywhere
--
-- Adds:
-- • follow_ups table (separate from activity_logs)
-- • analytics_events table (user interaction tracking)  
-- • escalations table (escalated conversation tracking)
-- • packages table (venue package definitions — editable from admin)
-- • Hardens existing tables with missing constraints
-- • Adds missing foreign key indexes
-- • Final RLS policy cleanup
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- FOLLOW_UPS TABLE
-- Tracks scheduled follow-up tasks per lead
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,

  type TEXT DEFAULT 'call' CHECK (type IN ('call', 'whatsapp', 'email', 'site_visit', 'proposal', 'other')),
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'rescheduled')),

  assigned_to TEXT DEFAULT 'team',
  created_by TEXT DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_lead_id ON follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled_at ON follow_ups(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);

DROP TRIGGER IF EXISTS update_follow_ups_updated_at ON follow_ups;
CREATE TRIGGER update_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follow_ups_service_role_all" ON follow_ups;
CREATE POLICY "follow_ups_service_role_all" ON follow_ups
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- ANALYTICS_EVENTS TABLE
-- Lightweight event tracking for business intelligence
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  event_type TEXT NOT NULL,    -- 'chat_started', 'lead_created', 'proposal_viewed', 'booking_confirmed', etc.
  session_id TEXT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  channel TEXT DEFAULT 'website' CHECK (channel IN ('website', 'whatsapp', 'admin', 'api')),
  properties JSONB DEFAULT '{}',   -- flexible event metadata

  -- Deduplication
  event_key TEXT,              -- optional unique key to prevent duplicate events
  UNIQUE (event_key)           -- null-safe: nulls don't violate UNIQUE constraint
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_lead_id ON analytics_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "analytics_events_service_role_all" ON analytics_events;
CREATE POLICY "analytics_events_service_role_all" ON analytics_events
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- ESCALATIONS TABLE
-- Tracks conversations that require human intervention
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  reason TEXT NOT NULL,            -- why it was escalated
  trigger_message TEXT,            -- the customer message that triggered it
  channel TEXT DEFAULT 'website' CHECK (channel IN ('website', 'whatsapp')),

  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored')),
  assigned_to TEXT,
  resolution_notes TEXT,

  -- AI context snapshot
  lead_name TEXT,
  lead_phone TEXT,
  summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalations_lead_id ON escalations(lead_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
CREATE INDEX IF NOT EXISTS idx_escalations_created_at ON escalations(created_at DESC);

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "escalations_service_role_all" ON escalations;
CREATE POLICY "escalations_service_role_all" ON escalations
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- PACKAGES TABLE
-- Stores venue package definitions — editable from admin
-- Allows updating pricing without code changes
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  name TEXT NOT NULL,                -- 'Silver', 'Gold', 'Platinum'
  venue TEXT NOT NULL,               -- 'monurama_rooftop', 'skyline', 'monurama_dining'
  tier INTEGER DEFAULT 1,            -- 1=Silver, 2=Gold, 3=Platinum

  base_price NUMERIC(10,2) NOT NULL,
  max_guests INTEGER DEFAULT 60,
  duration_hours INTEGER DEFAULT 4,

  -- What's included (array of strings)
  inclusions TEXT[] DEFAULT '{}',

  -- Add-ons available for this package
  addons JSONB DEFAULT '[]',         -- [{name, price, description}]

  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_popular BOOLEAN DEFAULT FALSE,

  -- Override AI system prompt with latest pricing
  ai_description TEXT               -- used to inject into AI knowledge base
);

CREATE INDEX IF NOT EXISTS idx_packages_venue ON packages(venue);
CREATE INDEX IF NOT EXISTS idx_packages_is_active ON packages(is_active) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS update_packages_updated_at ON packages;
CREATE TRIGGER update_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "packages_service_role_all" ON packages;
CREATE POLICY "packages_service_role_all" ON packages
  FOR ALL USING (auth.role() = 'service_role');
-- Anyone can read packages (chatbot needs them)
DROP POLICY IF EXISTS "packages_anon_read" ON packages;
CREATE POLICY "packages_anon_read" ON packages
  FOR SELECT USING (TRUE);

-- Seed default packages (idempotent via ON CONFLICT DO NOTHING)
-- Uses a temporary unique index approach
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Silver' AND venue = 'monurama_rooftop') THEN
    INSERT INTO packages (name, venue, tier, base_price, max_guests, duration_hours, inclusions, is_popular, ai_description) VALUES
    (
      'Silver', 'monurama_rooftop', 1, 42000, 60, 4,
      ARRAY['Rooftop venue (4 hours)', 'Basic decoration', 'Buffet dinner (veg + non-veg)', 'Sound system & music', 'Basic lighting', 'Event support staff'],
      false,
      'SILVER PACKAGE Rs42000: Rooftop venue 4hrs, basic decor, buffet, sound, lighting, staff. Up to 60 guests.'
    ),
    (
      'Gold', 'monurama_rooftop', 2, 50000, 60, 4,
      ARRAY['Rooftop venue (4 hours)', 'Premium decoration', 'Buffet dinner (expanded menu)', 'Sound system + microphone', 'Party lighting setup', 'Cake table setup', 'Event support staff'],
      true,
      'GOLD PACKAGE Rs50000 (MOST POPULAR): Rooftop venue 4hrs, premium decor, expanded buffet, mic, party lights, cake table, staff. Up to 60 guests.'
    ),
    (
      'Platinum', 'monurama_rooftop', 3, 59500, 60, 5,
      ARRAY['Rooftop venue (5 hours)', 'Premium theme decoration', 'Full buffet dinner', 'DJ music setup', 'Party lighting', 'Welcome drink', 'Cake table + stage setup', 'Full event coordination'],
      false,
      'PLATINUM PACKAGE Rs59500: Rooftop venue 5hrs, theme decor, full buffet, DJ, lights, welcome drink, stage, coordination. Up to 60 guests.'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────
-- HARDEN EXISTING TABLES
-- ─────────────────────────────────────────

-- Ensure conversations.session_id is unique (critical for chatbot)
-- Drop and recreate safely
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX conversations_session_id_unique ON conversations(session_id)
    WHERE session_id IS NOT NULL;
  EXCEPTION WHEN duplicate_table THEN
    -- Index already exists
  END;
END $$;

-- Ensure leads.phone index exists for fast deduplication lookup
CREATE INDEX IF NOT EXISTS idx_leads_phone_dedup ON leads(phone) WHERE phone IS NOT NULL;

-- Ensure activity_logs has all required columns
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS performed_by TEXT DEFAULT 'system';

-- Ensure message_queue has required columns (created in 002 but guard)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'message_queue') THEN
    ALTER TABLE message_queue ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
    ALTER TABLE message_queue ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;
    ALTER TABLE message_queue ADD COLUMN IF NOT EXISTS error TEXT;
    ALTER TABLE message_queue ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- ANALYTICS TRACKING FUNCTION
-- Lightweight event insertion — non-blocking
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION track_event(
  p_event_type TEXT,
  p_session_id TEXT DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_channel TEXT DEFAULT 'website',
  p_properties JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO analytics_events (event_type, session_id, lead_id, channel, properties)
  VALUES (p_event_type, p_session_id, p_lead_id, p_channel, p_properties)
  ON CONFLICT (event_key) DO NOTHING;
EXCEPTION WHEN others THEN
  -- Never fail — analytics is non-critical
  NULL;
END;
$$;

-- ─────────────────────────────────────────
-- ESCALATION TRIGGER
-- Auto-creates escalation record when conversation is marked escalated
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_conversation_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- When a conversation is marked as escalated
  IF NEW.is_escalated = TRUE AND (OLD.is_escalated IS DISTINCT FROM TRUE) THEN
    INSERT INTO escalations (
      conversation_id,
      lead_id,
      reason,
      trigger_message,
      channel,
      status,
      lead_name,
      lead_phone
    )
    SELECT
      NEW.id,
      NEW.lead_id,
      COALESCE(NEW.escalation_reason, 'Customer requested escalation'),
      NEW.escalation_reason,
      NEW.channel,
      'open',
      l.name,
      l.phone
    FROM leads l
    WHERE l.id = NEW.lead_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_conversation_escalated ON conversations;
CREATE TRIGGER on_conversation_escalated
  AFTER UPDATE ON conversations
  FOR EACH ROW
  WHEN (NEW.is_escalated = TRUE)
  EXECUTE FUNCTION handle_conversation_escalation();

-- ─────────────────────────────────────────
-- FINAL VERIFICATION QUERIES
-- Run these after migration to confirm
-- ─────────────────────────────────────────

-- 1. All tables:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;

-- 2. All new tables should appear:
-- follow_ups, analytics_events, escalations, packages

-- 3. Check packages seeded:
-- SELECT name, venue, base_price, is_popular FROM packages ORDER BY tier;

-- 4. Check all triggers:
-- SELECT trigger_name, event_object_table
-- FROM information_schema.triggers WHERE trigger_schema = 'public';

-- 5. Full counts:
-- SELECT 'leads' as t, COUNT(*) FROM leads
-- UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
-- UNION ALL SELECT 'knowledge_chunks', COUNT(*) FROM knowledge_chunks
-- UNION ALL SELECT 'packages', COUNT(*) FROM packages
-- UNION ALL SELECT 'follow_ups', COUNT(*) FROM follow_ups;
