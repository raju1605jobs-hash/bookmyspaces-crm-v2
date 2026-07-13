-- ═══════════════════════════════════════════════════════════
-- MIGRATION 013 — Proposal <-> Reservation Platform links
-- V3 Day 4 — Priority 6 (Proposal Integration).
--
-- `proposals` (migration 003, LIVE) is currently a flat, free-text table:
-- `venue TEXT`, `package_name TEXT`, no foreign keys into the structured
-- Reservation Platform schema (migration 012 — properties/inventory_items/
-- reservations/addon_services). `reservations.proposal_id` already
-- references `proposals(id)` (migration 012, one-directional). This
-- migration adds the reverse links, purely additive:
--   - All new columns are NULLABLE. No existing row is affected, no data
--     migrated, no existing column touched or renamed.
--   - `venue`/`package_name` (TEXT) are NOT removed or deprecated here —
--     per "reuse, don't rewrite working modules," the free-text snapshot
--     stays as the historical record of what was actually sent to the
--     customer; the new FKs are for proposals created by the new
--     Reservation Platform going forward, not a backfill of old proposals.
--   - Depends on migration 012 (properties, inventory_items, reservations,
--     addon_services) — apply in order, 012 before 013.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS addon_service_ids UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_proposals_property_id ON proposals(property_id);
CREATE INDEX IF NOT EXISTS idx_proposals_reservation_id ON proposals(reservation_id);

COMMENT ON COLUMN proposals.property_id IS 'V3 Reservation Platform link (migration 013). NULL for proposals created before this migration or outside the new reservation flow.';
COMMENT ON COLUMN proposals.reservation_id IS 'V3 Reservation Platform link (migration 013). Complements reservations.proposal_id (migration 012) — that FK is set when a reservation is created FROM a proposal; this one is set when a proposal is generated FROM an existing reservation. Both may be set for the same pair.';
COMMENT ON COLUMN proposals.addon_service_ids IS 'V3 Reservation Platform link (migration 013). References addon_services(id); not a DB-enforced array FK (Postgres limitation), validated at the application layer in src/lib/proposals/proposal-service.ts.';
