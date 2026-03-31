-- =============================================================================
-- Migration 003: Allow is_immigrant to be NULL
--
-- Field-entered birds don't know natal vs immigrant status.
-- NULL = "not yet determined" (resolved later via historical records).
-- 0 = natal (hatched on Mandarte), 1 = immigrant (arrived as adult).
-- =============================================================================

-- Birds table
ALTER TABLE birds DROP CONSTRAINT IF EXISTS birds_is_immigrant_check;
ALTER TABLE birds ALTER COLUMN is_immigrant DROP NOT NULL;
ALTER TABLE birds ADD CONSTRAINT birds_is_immigrant_check
  CHECK (is_immigrant IS NULL OR is_immigrant IN (0, 1));

COMMENT ON COLUMN birds.is_immigrant IS '1 = immigrant (not hatched on island), 0 = resident-hatched, NULL = unknown (field entry, not yet determined).';

-- Raw survival table — only if column exists
DO $$
BEGIN
  ALTER TABLE raw_survival DROP CONSTRAINT IF EXISTS raw_survival_is_immigrant_check;
  ALTER TABLE raw_survival ALTER COLUMN is_immigrant DROP NOT NULL;
  ALTER TABLE raw_survival ADD CONSTRAINT raw_survival_is_immigrant_check
    CHECK (is_immigrant IS NULL OR is_immigrant IN (0, 1));
EXCEPTION WHEN undefined_column THEN
  NULL; -- column doesn't exist yet, skip
END $$;
