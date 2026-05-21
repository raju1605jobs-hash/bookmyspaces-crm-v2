-- ═══════════════════════════════════════════════════════════════════════════
-- BOOKMYSPACES — PHASE 5: PROPOSAL INTELLIGENCE ENGINE
-- File  : 010_phase5_proposal_intelligence.sql
-- Runs  : AFTER 003_phase3_proposals.sql
-- Safety: 100% additive — no existing columns altered, no data at risk.
--         Every statement uses IF NOT EXISTS / IF EXISTS / OR REPLACE.
--         Safe to re-run multiple times without side effects.
--
-- Existing proposals columns (from 003, DO NOT touch):
--   id, created_at, updated_at, lead_id, proposal_number,
--   client_name, client_phone, client_email, event_type, event_date,
--   event_time, guest_count, venue, package_name,
--   base_price, addons, discount_amount, discount_reason,
--   total_price, advance_required,
--   special_requirements, inclusions, notes,
--   status CHECK('draft','sent','viewed','accepted','rejected','expired'),
--   sent_at, viewed_at, accepted_at, expires_at,
--   ai_cover_note, pdf_path, created_by
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: EXTEND status CHECK CONSTRAINT
--
-- Existing constraint allows: draft|sent|viewed|accepted|rejected|expired
-- We add: generated|followed_up
--
-- Strategy: drop the old named constraint, add new one with expanded values.
-- The constraint name in Postgres defaults to proposals_status_check.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE proposals
  DROP CONSTRAINT IF EXISTS proposals_status_check;

ALTER TABLE proposals
  ADD CONSTRAINT proposals_status_check
  CHECK (status IN (
    'draft',
    'generated',
    'sent',
    'viewed',
    'followed_up',
    'accepted',
    'rejected',
    'expired'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: LIFECYCLE TIMESTAMPS
--
-- viewed_at already exists from 003 (kept as-is).
-- We add finer-grained tracking: first vs last view, follow-up, rejection.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS generated_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_viewed_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS followed_up_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: ENGAGEMENT TRACKING
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS viewed_count      INTEGER NOT NULL DEFAULT 0
    CHECK (viewed_count >= 0),
  ADD COLUMN IF NOT EXISTS engagement_score  INTEGER NOT NULL DEFAULT 0
    CHECK (engagement_score >= 0 AND engagement_score <= 100),
  ADD COLUMN IF NOT EXISTS share_token       TEXT    DEFAULT NULL;

-- Unique index on share_token (only when non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_share_token
  ON proposals (share_token)
  WHERE share_token IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: INTELLIGENCE / URGENCY FIELDS
--
-- Written by computeProposalUrgency() and persisted via PATCH /api/proposals/intelligence
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS urgency_score        INTEGER NOT NULL DEFAULT 0
    CHECK (urgency_score >= 0 AND urgency_score <= 100),
  ADD COLUMN IF NOT EXISTS risk_level           TEXT    NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS next_action          TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recommendation       TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS escalation_required  BOOLEAN NOT NULL DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: AI GENERATION CONTENT FIELDS
--
-- Written by generateProposalIntelligence() and stored for fast retrieval.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS ai_summary           TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recommended_package  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS venue_fit_reasoning  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS upsell_suggestions   JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS urgency_cta          TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence_score     INTEGER NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary dashboard sort: urgency descending, active proposals only
CREATE INDEX IF NOT EXISTS idx_proposals_urgency_active
  ON proposals (urgency_score DESC)
  WHERE status NOT IN ('accepted', 'rejected', 'expired');

-- Escalation queue
CREATE INDEX IF NOT EXISTS idx_proposals_escalation
  ON proposals (escalation_required)
  WHERE escalation_required = TRUE;

-- Time-based follow-up queries
CREATE INDEX IF NOT EXISTS idx_proposals_last_viewed
  ON proposals (last_viewed_at DESC NULLS LAST)
  WHERE last_viewed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_followed_up
  ON proposals (followed_up_at)
  WHERE followed_up_at IS NOT NULL;

-- Sent-but-unopened detection
CREATE INDEX IF NOT EXISTS idx_proposals_sent_unopened
  ON proposals (sent_at ASC)
  WHERE status = 'sent' AND viewed_count = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: PROPOSAL INTELLIGENCE VIEW
--
-- Joins proposals + leads for dashboard queries.
-- Computes derived boolean flags directly in SQL for fast filtering.
-- No extra API calls needed for the dashboard table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW proposal_intelligence_view AS
SELECT
  -- Core proposal fields
  p.id,
  p.proposal_number,
  p.lead_id,
  p.client_name,
  p.client_phone,
  p.client_email,
  p.event_type,
  p.event_date,
  p.guest_count,
  p.package_name,
  p.total_price,
  p.advance_required,
  p.status,
  p.created_at,
  p.updated_at,

  -- Lifecycle timestamps
  p.sent_at,
  p.viewed_at,
  p.accepted_at,
  p.expires_at,
  p.generated_at,
  p.first_viewed_at,
  p.last_viewed_at,
  p.followed_up_at,
  p.rejected_at,

  -- Engagement
  p.viewed_count,
  p.engagement_score,
  p.share_token,

  -- Intelligence outputs
  p.urgency_score,
  p.risk_level,
  p.next_action,
  p.recommendation,
  p.escalation_required,

  -- AI content
  p.ai_summary,
  p.recommended_package,
  p.venue_fit_reasoning,
  p.upsell_suggestions,
  p.urgency_cta,
  p.confidence_score,

  -- Lead context (joined)
  l.name              AS lead_name,
  l.phone             AS lead_phone,
  l.lead_temperature,
  l.ai_score          AS lead_ai_score,
  l.lead_stage,
  l.estimated_revenue AS lead_estimated_revenue,
  l.budget            AS lead_budget,

  -- Computed: hours elapsed since key events
  CASE WHEN p.sent_at IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (NOW() - p.sent_at)) / 3600.0)::INTEGER
    ELSE NULL
  END AS hours_since_sent,

  CASE WHEN p.last_viewed_at IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (NOW() - p.last_viewed_at)) / 3600.0)::INTEGER
    ELSE NULL
  END AS hours_since_viewed,

  CASE WHEN p.followed_up_at IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (NOW() - p.followed_up_at)) / 3600.0)::INTEGER
    ELSE NULL
  END AS hours_since_followup,

  -- Computed: action flags (used by frontend without extra computation)
  (
    p.status = 'sent'
    AND p.viewed_count = 0
    AND p.sent_at IS NOT NULL
    AND p.sent_at < NOW() - INTERVAL '48 hours'
  ) AS resend_recommended,

  (
    p.status = 'viewed'
    AND p.last_viewed_at IS NOT NULL
    AND p.last_viewed_at < NOW() - INTERVAL '24 hours'
    AND p.followed_up_at IS NULL
  ) AS follow_up_required,

  (
    l.lead_temperature = 'HOT'
    AND p.viewed_count > 1
    AND p.status = 'viewed'
    AND p.escalation_required = TRUE
  ) AS escalate_sales_priority,

  (
    p.status IN ('draft', 'generated')
    AND l.ai_score IS NOT NULL
    AND l.ai_score >= 70
  ) AS proposal_blocker  -- QUALIFIED lead, proposal not sent yet

FROM proposals p
LEFT JOIN leads l ON l.id = p.lead_id
ORDER BY p.urgency_score DESC, p.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: URGENCY SUMMARY VIEW
--
-- Aggregated counts for dashboard KPI cards.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW proposal_urgency_summary AS
SELECT
  COUNT(*)                                                    AS total_proposals,
  COUNT(*) FILTER (WHERE status NOT IN ('accepted','rejected','expired'))
                                                              AS active_proposals,
  COUNT(*) FILTER (WHERE status = 'accepted')                 AS accepted_proposals,
  COUNT(*) FILTER (WHERE escalation_required = TRUE
                   AND status NOT IN ('accepted','rejected','expired'))
                                                              AS escalated,
  COUNT(*) FILTER (WHERE status = 'sent'
                   AND viewed_count = 0
                   AND sent_at < NOW() - INTERVAL '48 hours') AS resend_recommended,
  COUNT(*) FILTER (WHERE status = 'viewed'
                   AND last_viewed_at < NOW() - INTERVAL '24 hours'
                   AND followed_up_at IS NULL)                AS follow_up_required,
  COALESCE(SUM(total_price) FILTER (
    WHERE status NOT IN ('rejected','expired')
  ), 0)                                                       AS total_pipeline_value,
  COALESCE(SUM(total_price) FILTER (
    WHERE status = 'accepted'
  ), 0)                                                       AS won_revenue
FROM proposals;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: POLICY GUARD
--
-- The table already has RLS + service_role policy from 003.
-- We only add a policy if one does not already exist, to avoid duplicate errors.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'proposals'
      AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON proposals
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (uncomment and run separately after migration)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Confirm all new columns exist
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'proposals'
--   AND column_name IN (
--     'generated_at', 'first_viewed_at', 'last_viewed_at',
--     'followed_up_at', 'rejected_at',
--     'viewed_count', 'engagement_score', 'share_token',
--     'urgency_score', 'risk_level', 'next_action',
--     'recommendation', 'escalation_required',
--     'ai_summary', 'recommended_package', 'venue_fit_reasoning',
--     'upsell_suggestions', 'urgency_cta', 'confidence_score'
--   )
-- ORDER BY column_name;

-- 2. Confirm status CHECK was extended
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'proposals'::regclass
--   AND contype = 'c'
--   AND conname = 'proposals_status_check';

-- 3. Confirm views exist
-- SELECT viewname FROM pg_views
-- WHERE schemaname = 'public'
--   AND viewname IN (
--     'proposal_intelligence_view',
--     'proposal_urgency_summary'
--   );

-- 4. Confirm indexes
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'proposals'
--   AND indexname LIKE 'idx_proposals_%'
-- ORDER BY indexname;

-- 5. Quick sanity check on the view
-- SELECT * FROM proposal_urgency_summary;
