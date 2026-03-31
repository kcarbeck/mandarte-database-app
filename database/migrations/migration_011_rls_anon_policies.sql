-- =============================================================================
-- Migration 011: Add anon role to all RLS write policies
--
-- PROBLEM: Migration 009 created write policies for 'authenticated' role only.
-- The field app uses the Supabase anon key, which runs as the 'anon' role.
-- This causes "row-level security policy" errors on all writes.
--
-- FIX: Add parallel policies for the anon role on all working tables.
-- In production, replace with proper auth (JWT + authenticated role).
--
-- Run AFTER migration_009.
-- =============================================================================

-- BIRDS
DROP POLICY IF EXISTS "Anon can insert birds" ON birds;
CREATE POLICY "Anon can insert birds"
    ON birds FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update birds" ON birds;
CREATE POLICY "Anon can update birds"
    ON birds FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- TERRITORY_ASSIGNMENTS
DROP POLICY IF EXISTS "Anon can insert territory_assignments" ON territory_assignments;
CREATE POLICY "Anon can insert territory_assignments"
    ON territory_assignments FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update territory_assignments" ON territory_assignments;
CREATE POLICY "Anon can update territory_assignments"
    ON territory_assignments FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can read territory_assignments" ON territory_assignments;
CREATE POLICY "Anon can read territory_assignments"
    ON territory_assignments FOR SELECT TO anon USING (true);

-- BREED
DROP POLICY IF EXISTS "Anon can insert breed" ON breed;
CREATE POLICY "Anon can insert breed"
    ON breed FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update breed" ON breed;
CREATE POLICY "Anon can update breed"
    ON breed FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- SURVIVAL
DROP POLICY IF EXISTS "Anon can insert survival" ON survival;
CREATE POLICY "Anon can insert survival"
    ON survival FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update survival" ON survival;
CREATE POLICY "Anon can update survival"
    ON survival FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- CORRECTIONS (append-only audit trail — INSERT only, no UPDATE/DELETE)
DROP POLICY IF EXISTS "Anon can insert corrections" ON corrections;
CREATE POLICY "Anon can insert corrections"
    ON corrections FOR INSERT TO anon WITH CHECK (true);

-- NEST_VISITS
DROP POLICY IF EXISTS "Anon can insert nest_visits" ON nest_visits;
CREATE POLICY "Anon can insert nest_visits"
    ON nest_visits FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update nest_visits" ON nest_visits;
CREATE POLICY "Anon can update nest_visits"
    ON nest_visits FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- TERRITORY_VISITS
DROP POLICY IF EXISTS "Anon can insert territory_visits" ON territory_visits;
CREATE POLICY "Anon can insert territory_visits"
    ON territory_visits FOR INSERT TO anon WITH CHECK (true);
