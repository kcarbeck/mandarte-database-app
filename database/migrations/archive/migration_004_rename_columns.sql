-- =============================================================================
-- Migration 004: Rename confusing columns
--
-- 1. birds.is_placeholder → birds.is_unbanded (clearer meaning)
-- 2. territory_assignments.role: 'resident' → 'territory_holder'
--    (avoids confusion with natal resident vs immigrant)
-- =============================================================================

-- Rename is_placeholder → is_unbanded
ALTER TABLE birds RENAME COLUMN is_placeholder TO is_unbanded;
ALTER TABLE birds RENAME COLUMN placeholder_description TO unbanded_description;

COMMENT ON COLUMN birds.is_unbanded IS 'TRUE for birds not yet banded. band_id will be a temporary negative number until banded.';
COMMENT ON COLUMN birds.unbanded_description IS 'Human-readable note for unbanded birds, e.g. "Unbanded male on Terr 12"';

-- Step 1: Drop old constraint
ALTER TABLE territory_assignments DROP CONSTRAINT IF EXISTS territory_assignments_role_check;

-- Step 2: Migrate existing data BEFORE adding new constraint
UPDATE territory_assignments SET role = 'territory_holder' WHERE role = 'resident';

-- Step 3: Add new constraint
ALTER TABLE territory_assignments ADD CONSTRAINT territory_assignments_role_check
  CHECK (role IN ('territory_holder', 'floater'));
