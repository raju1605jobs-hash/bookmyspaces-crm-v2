-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES — PHASE 1: LEAD SCORING COLUMNS
-- File: 008_phase1_lead_scoring.sql
-- Run AFTER 001–007 migrations.
-- Safe to re-run — uses ADD COLUMN IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- SECTION 1: NEW COLUMNS ON leads
-- NOTE: ai_score already exists in the live DB (added in 005_stability_patch.sql).
--       We do NOT add lead_score — that column does not exist and is not needed.
--       All scoring writes to ai_score (existing column).
-- ─────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_temperature TEXT
  CHECK (lead_temperature IN ('HOT', 'WARM', 'COLD'));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS urgency_level TEXT
  CHECK (urgency_level IN ('HIGH', 'MEDIUM', 'LOW'));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS estimated_revenue NUMERIC(12, 2) DEFAULT 0;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}';
-- Stores: { event_type_score, guest_score, date_score, budget_score, source_score, reasoning }

ALTER TABLE leads ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

-- ─────────────────────────────────────────
-- SECTION 2: INDEXES ON NEW COLUMNS
-- ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_temperature
  ON leads(lead_temperature);

CREATE INDEX IF NOT EXISTS idx_leads_urgency
  ON leads(urgency_level);

CREATE INDEX IF NOT EXISTS idx_leads_estimated_revenue
  ON leads(estimated_revenue DESC);

CREATE INDEX IF NOT EXISTS idx_leads_scored_at
  ON leads(scored_at DESC);

-- Partial index: HOT leads only — used heavily by dashboard
CREATE INDEX IF NOT EXISTS idx_leads_hot
  ON leads(created_at DESC)
  WHERE lead_temperature = 'HOT';

-- ─────────────────────────────────────────
-- SECTION 3: HOT LEADS VIEW (used by dashboard)
-- ─────────────────────────────────────────

CREATE OR REPLACE VIEW hot_leads AS
SELECT
  id,
  name,
  phone,
  email,
  event_type,
  event_date,
  guest_count,
  budget,
  status,
  source,
  ai_score,
  lead_temperature,
  urgency_level,
  estimated_revenue,
  tags,
  last_contacted_at,
  created_at,
  scored_at
FROM leads
WHERE lead_temperature = 'HOT'
ORDER BY ai_score DESC, created_at DESC;

-- ─────────────────────────────────────────
-- SECTION 4: SCORING SUMMARY VIEW
-- ─────────────────────────────────────────

CREATE OR REPLACE VIEW lead_scoring_summary AS
SELECT
  lead_temperature,
  urgency_level,
  COUNT(*)                          AS total_leads,
  ROUND(AVG(ai_score), 1)          AS avg_score,
  ROUND(SUM(estimated_revenue), 2)  AS total_pipeline_value,
  COUNT(*) FILTER (
    WHERE created_at > NOW() - INTERVAL '7 days'
  )                                 AS leads_last_7_days
FROM leads
WHERE lead_temperature IS NOT NULL
GROUP BY lead_temperature, urgency_level
ORDER BY
  CASE lead_temperature WHEN 'HOT' THEN 1 WHEN 'WARM' THEN 2 ELSE 3 END,
  CASE urgency_level    WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END;

-- ─────────────────────────────────────────
-- SECTION 5: VERIFY
-- Uncomment and run manually to confirm
-- ─────────────────────────────────────────

-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'leads'
--   AND column_name IN (
--     'lead_temperature', 'urgency_level',
--     'estimated_revenue', 'score_breakdown', 'scored_at'
--   )
-- ORDER BY ordinal_position;

-- SELECT * FROM lead_scoring_summary;
