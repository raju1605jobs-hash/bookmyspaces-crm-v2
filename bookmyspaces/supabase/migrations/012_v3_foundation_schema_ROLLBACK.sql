-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES V3 — ROLLBACK for 012_v3_foundation_schema.sql
--
-- Written during the Day 2 database review, which found that migration 012
-- had no corresponding rollback. Not run against anything — 012 itself has
-- never been applied to a live database (still hand-off-pending per its own
-- header). This exists so that IF a Product Owner applies 012 and later
-- needs to undo it, there's a reviewed script instead of an improvised one.
--
-- Safe by construction: every object below was CREATEd by 012 and nothing
-- else. Drops go in strict reverse-dependency order (children before
-- parents) so foreign keys never block a drop. `leads`, `proposals`,
-- `invoices`, `packages`, `knowledge_chunks` and every other pre-existing
-- table are untouched — 012 only ever added FKs pointing at them, it never
-- altered them, so there is nothing on those tables to roll back.
--
-- This DOES destroy data in the 012 tables (that's what a rollback of a
-- CREATE TABLE migration means). Per the overnight authorization's
-- irreversible-action rule, do not run this against a database that has
-- accumulated real reservations/conversations/identities without the
-- Product Owner explicitly confirming that data loss is intended — take a
-- pg_dump of these 14 tables first if there's any doubt.
-- ═══════════════════════════════════════════════════════════

-- Seed data (INSERTed by 012, not schema, but undone first for clarity)
DELETE FROM properties WHERE slug IN ('skyline-serenity', 'monurama-homestay');

-- Tables with FKs into other 012 tables — drop before what they reference
DROP TABLE IF EXISTS ai_interaction_log CASCADE;
DROP TABLE IF EXISTS reservation_addons CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS addon_services CASCADE;
DROP TABLE IF EXISTS rate_plans CASCADE;
DROP TABLE IF EXISTS meal_plans CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS unified_messages CASCADE;
DROP TABLE IF EXISTS unified_conversation_channels CASCADE;
DROP TABLE IF EXISTS unified_conversations CASCADE;
DROP TABLE IF EXISTS customer_identities CASCADE;

-- Tables nothing else in 012 depends on
DROP TABLE IF EXISTS knowledge_sources CASCADE;
DROP TABLE IF EXISTS ai_prompts CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS channels CASCADE;

-- Root table — everything above referenced this, must go last
DROP TABLE IF EXISTS properties CASCADE;

-- Note: `update_updated_at_column()` is a shared trigger function created by
-- an earlier migration (001) and used across many pre-012 tables too — not
-- dropped here, since dropping it would break unrelated tables. Each
-- `DROP TABLE ... CASCADE` above already removes that table's own trigger
-- as part of dropping the table itself.
