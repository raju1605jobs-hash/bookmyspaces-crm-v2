-- ═══════════════════════════════════════════════════════════════════════════
-- BOOKMYSPACES — EMAIL SENDING SYSTEM: email_log TABLE
-- File  : 011_email_log.sql
-- Runs  : AFTER 009_document_undocumented_production_objects.sql
-- Safety: 100% additive — only creates one new table, indexes, and RLS
--         policies. Does not touch any existing table, column, or data.
--         Every statement is idempotent (IF NOT EXISTS). Safe to re-run.
--
-- Purpose: records every email the app tries to send (proposal, invoice,
-- payment reminder, follow-up, booking confirmation), whether it succeeded
-- or failed, and which provider handled it. Nothing reads this table to
-- make decisions yet — it exists purely as an audit trail so staff can see
-- what was actually sent to a customer and troubleshoot delivery problems.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS email_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Who / what this email was about
  to_email            TEXT NOT NULL,
  from_email          TEXT NOT NULL,
  subject             TEXT NOT NULL,
  template_type       TEXT NOT NULL
    CHECK (template_type IN (
      'proposal', 'invoice', 'payment_reminder', 'follow_up', 'booking_confirmation'
    )),
  related_entity_type TEXT
    CHECK (related_entity_type IN ('lead', 'proposal') OR related_entity_type IS NULL),
  related_entity_id   UUID,

  -- Delivery tracking
  provider            TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'bounced')),
  error_message       TEXT,

  -- Free-form extra context (e.g. which staff member triggered it)
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,

  sent_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_log_created_at    ON email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_related_entity ON email_log (related_entity_type, related_entity_id)
  WHERE related_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_status         ON email_log (status);
CREATE INDEX IF NOT EXISTS idx_email_log_template_type   ON email_log (template_type);

-- Same convention as every other table in this project: service-role only.
-- The app's server-side email code uses the service-role client, matching
-- how every other background/system table (activity_events, scheduled_jobs,
-- system_health_log, etc.) is accessed.
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_log_service_role" ON email_log;
CREATE POLICY "email_log_service_role" ON email_log
  FOR ALL USING (auth.role() = 'service_role');

COMMIT;
