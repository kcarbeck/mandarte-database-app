-- =============================================================================
-- Migration 010: Add breed_id to nest_visits for field nest linking
-- Date: 2026-03-28
--
-- PROBLEM: nest_visits links to breed via nestrec, but field-entered nests
-- have nestrec = NULL (assigned during proofing). This means nest visits
-- CANNOT be logged for field nests — the insert fails or visits are orphaned.
--
-- FIX: Add breed_id as an alternative link column. Field nests use breed_id,
-- historical nests use nestrec. Both are valid foreign keys to breed.
-- Make nestrec nullable so field nest visits don't need it.
-- =============================================================================

-- Step 1: Add breed_id column to nest_visits
ALTER TABLE nest_visits ADD COLUMN IF NOT EXISTS breed_id BIGINT;

-- Step 2: Make nestrec nullable (field nests don't have one yet)
ALTER TABLE nest_visits ALTER COLUMN nestrec DROP NOT NULL;

-- Step 3: Add CHECK constraint — at least one link must be present
-- (either nestrec or breed_id, or both)
ALTER TABLE nest_visits DROP CONSTRAINT IF EXISTS nest_visits_has_link;
ALTER TABLE nest_visits ADD CONSTRAINT nest_visits_has_link
    CHECK (nestrec IS NOT NULL OR breed_id IS NOT NULL);

-- Step 4: Index for breed_id lookups
CREATE INDEX IF NOT EXISTS idx_nest_visits_breed_id ON nest_visits(breed_id);

-- Step 5: Backfill breed_id for existing visits that have nestrec
UPDATE nest_visits nv
SET breed_id = b.breed_id
FROM breed b
WHERE nv.nestrec = b.nestrec
  AND nv.breed_id IS NULL;

-- Step 6: RLS policy for nest_visits (if not already present)
DROP POLICY IF EXISTS "Authenticated users can insert nest_visits" ON nest_visits;
CREATE POLICY "Authenticated users can insert nest_visits"
    ON nest_visits FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update nest_visits" ON nest_visits;
CREATE POLICY "Authenticated users can update nest_visits"
    ON nest_visits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Step 7: Comment
COMMENT ON COLUMN nest_visits.breed_id IS 'Links to breed.breed_id. Used for field-entered nests that do not yet have a nestrec. Historical nests use nestrec; field nests use breed_id. At least one must be set.';
