-- =============================================================================
-- Migration 009: Add missing RLS write policies
--
-- PROBLEM: The schema only created INSERT policies for territory_visits and
-- nest_visits. The field app also needs to INSERT/UPDATE on:
--   birds, territory_assignments, breed, survival, corrections
--
-- Without these policies, writes fail with:
--   "new row violates row-level security policy for table X"
--
-- The app uses the anon key (RLS enforced), so these policies are required.
--
-- NOTE: For production, these should be restricted to authenticated users
-- with specific roles. For now, allowing all authenticated users to write
-- to working tables. Raw archive tables remain read-only.
--
-- Run AFTER migration_008.
-- =============================================================================


-- =============================================================================
-- BIRDS — Authenticated users can insert and update
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert birds" ON birds;
CREATE POLICY "Authenticated users can insert birds"
    ON birds FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update birds" ON birds;
CREATE POLICY "Authenticated users can update birds"
    ON birds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- TERRITORY_ASSIGNMENTS — Authenticated users can insert and update
-- (Database triggers from migration_008 protect historical records)
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert territory_assignments" ON territory_assignments;
CREATE POLICY "Authenticated users can insert territory_assignments"
    ON territory_assignments FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update territory_assignments" ON territory_assignments;
CREATE POLICY "Authenticated users can update territory_assignments"
    ON territory_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Also need SELECT policy if not already present
DROP POLICY IF EXISTS "Authenticated users can read territory_assignments" ON territory_assignments;
CREATE POLICY "Authenticated users can read territory_assignments"
    ON territory_assignments FOR SELECT TO authenticated USING (true);


-- =============================================================================
-- BREED — Authenticated users can insert and update
-- (Database triggers from migration_008 protect historical/proofed records)
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert breed" ON breed;
CREATE POLICY "Authenticated users can insert breed"
    ON breed FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update breed" ON breed;
CREATE POLICY "Authenticated users can update breed"
    ON breed FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- SURVIVAL — Authenticated users can insert and update
-- (Database triggers from migration_008 protect historical/proofed records)
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert survival" ON survival;
CREATE POLICY "Authenticated users can insert survival"
    ON survival FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update survival" ON survival;
CREATE POLICY "Authenticated users can update survival"
    ON survival FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- CORRECTIONS — Authenticated users can insert (append-only audit trail)
-- No UPDATE or DELETE — corrections are immutable once written.
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert corrections" ON corrections;
CREATE POLICY "Authenticated users can insert corrections"
    ON corrections FOR INSERT TO authenticated WITH CHECK (true);


-- =============================================================================
-- TERRITORY_VISITS — Also need UPDATE policy (currently only has INSERT)
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can update territory_visits" ON territory_visits;
CREATE POLICY "Authenticated users can update territory_visits"
    ON territory_visits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- NEST_VISITS — Also need UPDATE policy (currently only has INSERT)
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can update nest_visits" ON nest_visits;
CREATE POLICY "Authenticated users can update nest_visits"
    ON nest_visits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- STAGING/IMPORT TABLES — Authenticated users can insert and update
-- (These are only used during import sessions)
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert staging_birds" ON staging_birds;
CREATE POLICY "Authenticated users can insert staging_birds"
    ON staging_birds FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update staging_birds" ON staging_birds;
CREATE POLICY "Authenticated users can update staging_birds"
    ON staging_birds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can insert import_conflicts" ON import_conflicts;
CREATE POLICY "Authenticated users can insert import_conflicts"
    ON import_conflicts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update import_conflicts" ON import_conflicts;
CREATE POLICY "Authenticated users can update import_conflicts"
    ON import_conflicts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can insert import_log" ON import_log;
CREATE POLICY "Authenticated users can insert import_log"
    ON import_log FOR INSERT TO authenticated WITH CHECK (true);


-- =============================================================================
-- RAW TABLES — Remain read-only through RLS (INSERT only for import scripts)
-- The service_role key bypasses RLS for import scripts.
-- Database triggers from migration_008 block UPDATE/DELETE regardless.
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert raw_survival" ON raw_survival;
CREATE POLICY "Authenticated users can insert raw_survival"
    ON raw_survival FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can insert raw_breed" ON raw_breed;
CREATE POLICY "Authenticated users can insert raw_breed"
    ON raw_breed FOR INSERT TO authenticated WITH CHECK (true);
