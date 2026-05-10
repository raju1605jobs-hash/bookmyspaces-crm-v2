-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES — PHASE 3 SCHEMA ADDITIONS
-- Run AFTER 002_phase2_whatsapp.sql
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- PROPOSALS TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  proposal_number TEXT UNIQUE,    -- e.g. BMS-2026-001

  -- Event Details (snapshot at time of proposal)
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  event_type TEXT,
  event_date DATE,
  event_time TEXT,
  guest_count INTEGER,
  venue TEXT,
  package_name TEXT,             -- Silver / Gold / Platinum / Custom

  -- Pricing
  base_price NUMERIC(10,2),
  addons JSONB DEFAULT '[]',     -- [{name, price}]
  discount_amount NUMERIC(10,2) DEFAULT 0,
  discount_reason TEXT,
  total_price NUMERIC(10,2),
  advance_required NUMERIC(10,2),

  -- Special requirements
  special_requirements TEXT,
  inclusions TEXT[],
  notes TEXT,

  -- Status
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired')),

  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- AI generated content
  ai_cover_note TEXT,

  -- PDF storage
  pdf_path TEXT,

  created_by TEXT DEFAULT 'admin'
);

CREATE TRIGGER update_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON proposals
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- BOOKINGS TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,

  event_date DATE NOT NULL,
  event_time TEXT,
  event_end_time TEXT,
  venue TEXT NOT NULL,
  client_name TEXT,
  client_phone TEXT,
  event_type TEXT,
  guest_count INTEGER,
  package_name TEXT,
  total_price NUMERIC(10,2),
  advance_paid NUMERIC(10,2) DEFAULT 0,
  balance_due NUMERIC(10,2),

  status TEXT DEFAULT 'confirmed'
    CHECK (status IN ('tentative', 'confirmed', 'completed', 'cancelled')),

  google_calendar_event_id TEXT,
  notes TEXT,

  created_by TEXT DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date);
CREATE INDEX IF NOT EXISTS idx_bookings_venue ON bookings(venue);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON bookings
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- AUTO-INCREMENT PROPOSAL NUMBER
-- ─────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS proposal_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_proposal_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.proposal_number IS NULL THEN
    NEW.proposal_number := 'BMS-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('proposal_number_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_proposal_number
  BEFORE INSERT ON proposals
  FOR EACH ROW EXECUTE FUNCTION generate_proposal_number();

-- ─────────────────────────────────────────
-- LEAD SCORING FIELDS
-- ─────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS ai_score_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_probability INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS event_time TEXT,
  ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

-- ─────────────────────────────────────────
-- BLOCKED DATES TABLE (for availability)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  venue TEXT NOT NULL,
  reason TEXT,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_dates_venue_date ON blocked_dates(date, venue);

ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON blocked_dates
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anon can read blocked dates" ON blocked_dates
  FOR SELECT USING (TRUE);
