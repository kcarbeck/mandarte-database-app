-- =============================================================================
-- Migration 005: Add field_id column to birds
--
-- When an unbanded bird is first entered, it gets a temporary negative band_id
-- (e.g., -482931). When that bird is later banded, we UPDATE the row:
--   - band_id becomes the real metal band number
--   - field_id preserves the original negative ID permanently
--   - is_unbanded flips to FALSE
--   - color_combo gets filled in
--
-- The field_id column:
--   - Is NULL for birds that were entered already banded
--   - Contains the original negative band_id for birds entered unbanded
--   - Has a UNIQUE constraint so no two birds can share a field_id
--   - Is never reused or reassigned
--
-- Run AFTER migration_004 (column renames).
-- =============================================================================

-- Add field_id column
ALTER TABLE birds ADD COLUMN IF NOT EXISTS field_id INTEGER;

COMMENT ON COLUMN birds.field_id IS 'Original temporary negative band_id assigned in the field before banding. NULL for birds entered already banded. Never reused.';

-- Unique constraint: each field_id can only belong to one bird
CREATE UNIQUE INDEX IF NOT EXISTS idx_birds_field_id ON birds (field_id) WHERE field_id IS NOT NULL;

-- Backfill: any existing unbanded birds (negative band_id) should have
-- their current band_id copied into field_id so the link is established
-- before they get banded.
UPDATE birds
SET field_id = band_id
WHERE band_id < 0
  AND field_id IS NULL;
