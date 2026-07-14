-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES V3 — ROLLBACK for 004_phase4_campaigns.sql
--
-- Written during Go-Live Preparation: migration 004 (like 012 before this
-- rollback was written for it) had no corresponding rollback script. Not run
-- against anything — this exists so that IF migration 004 is applied live
-- and later needs to be undone, there's a reviewed script instead of an
-- improvised one, matching the same standard 012 and 013 already have.
--
-- Safe by construction: every object below was CREATEd or ADDed by 004 and
-- nothing else. `leads` itself is pre-existing (migration 001) and is NOT
-- dropped — only the 5 columns 004 added to it are removed. No table 004
-- created has a foreign key into another 004 table, so drop order is not
-- safety-critical here (unlike 012), but tables are still dropped in
-- reverse-creation order for consistency with 012_..._ROLLBACK.sql's
-- convention.
--
-- This DOES destroy data in the 004 tables (that's what a rollback of a
-- CREATE TABLE migration means) — including any campaigns, AI daily
-- summaries, or staff performance records created after 004 went live, and
-- the `is_vip`/`lifetime_value`/etc. flags on any `leads` rows. Do not run
-- this against a database with real campaign or staff-performance data
-- without the Product Owner explicitly confirming data loss is intended —
-- take a pg_dump of these 5 tables first if there's any doubt. The seeded
-- festival_calendar rows and notification_settings defaults are
-- reference/config data, not business data — losing them is low-risk and
-- they can be re-seeded by re-running 004.
-- ═══════════════════════════════════════════════════════════

-- Reverse-creation order: last-created table first.

DROP TABLE IF EXISTS notification_settings CASCADE;
DROP TABLE IF EXISTS staff_performance CASCADE;

-- Columns 004 added to the pre-existing `leads` table — table itself untouched.
ALTER TABLE leads
  DROP COLUMN IF EXISTS repeat_customer,
  DROP COLUMN IF EXISTS referral_source,
  DROP COLUMN IF EXISTS lifetime_value,
  DROP COLUMN IF EXISTS vip_reason,
  DROP COLUMN IF EXISTS is_vip;

DROP TABLE IF EXISTS festival_calendar CASCADE;
DROP TABLE IF EXISTS ai_summaries CASCADE;
DROP TABLE IF EXISTS broadcast_campaigns CASCADE;
