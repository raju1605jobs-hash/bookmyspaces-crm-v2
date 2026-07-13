-- ROLLBACK for 013_proposal_reservation_links.sql
-- Drops only the columns/indexes this migration added. Does not touch any
-- pre-existing `proposals` column or row data.

DROP INDEX IF EXISTS idx_proposals_reservation_id;
DROP INDEX IF EXISTS idx_proposals_property_id;

ALTER TABLE proposals
  DROP COLUMN IF EXISTS addon_service_ids,
  DROP COLUMN IF EXISTS package_id,
  DROP COLUMN IF EXISTS reservation_id,
  DROP COLUMN IF EXISTS inventory_item_id,
  DROP COLUMN IF EXISTS property_id;
