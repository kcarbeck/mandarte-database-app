-- =============================================================================
-- Migration 002: RLS Policy Cleanup
-- Run this to deduplicate policies and ensure all tables are accessible.
-- Safe to re-run at any time.
-- =============================================================================

-- -------------------------------------------------------
-- BIRDS — clean up duplicate policies, keep one set
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Anon can read birds" ON birds;
DROP POLICY IF EXISTS "Anon can insert birds" ON birds;
DROP POLICY IF EXISTS "Anon can update birds" ON birds;
DROP POLICY IF EXISTS "Auth can insert birds" ON birds;
DROP POLICY IF EXISTS "Auth can update birds" ON birds;
DROP POLICY IF EXISTS "Authenticated users can read birds" ON birds;
DROP POLICY IF EXISTS "Authenticated users can insert birds" ON birds;
DROP POLICY IF EXISTS "Authenticated users can update birds" ON birds;
DROP POLICY IF EXISTS "Anyone can read birds" ON birds;

ALTER TABLE birds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read birds" ON birds FOR SELECT USING (true);
CREATE POLICY "Anyone can insert birds" ON birds FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update birds" ON birds FOR UPDATE USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- BREED — clean up duplicate policies
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Anon can read breed" ON breed;
DROP POLICY IF EXISTS "Anon can insert breed" ON breed;
DROP POLICY IF EXISTS "Anon can update breed" ON breed;
DROP POLICY IF EXISTS "Auth can insert breed" ON breed;
DROP POLICY IF EXISTS "Auth can update breed" ON breed;
DROP POLICY IF EXISTS "Authenticated users can read breed" ON breed;
DROP POLICY IF EXISTS "Authenticated users can insert breed" ON breed;
DROP POLICY IF EXISTS "Authenticated users can update breed" ON breed;
DROP POLICY IF EXISTS "Anyone can read breed" ON breed;

ALTER TABLE breed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read breed" ON breed FOR SELECT USING (true);
CREATE POLICY "Anyone can insert breed" ON breed FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update breed" ON breed FOR UPDATE USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- TERRITORY_VISITS — clean up duplicate policies
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Anon can read territory_visits" ON territory_visits;
DROP POLICY IF EXISTS "Anon can insert territory_visits" ON territory_visits;
DROP POLICY IF EXISTS "Auth can insert territory_visits" ON territory_visits;
DROP POLICY IF EXISTS "Authenticated users can read territory_visits" ON territory_visits;
DROP POLICY IF EXISTS "Authenticated users can insert territory_visits" ON territory_visits;
DROP POLICY IF EXISTS "Anyone can read territory_visits" ON territory_visits;

ALTER TABLE territory_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read territory_visits" ON territory_visits FOR SELECT USING (true);
CREATE POLICY "Anyone can insert territory_visits" ON territory_visits FOR INSERT WITH CHECK (true);

-- -------------------------------------------------------
-- NEST_VISITS — clean up duplicate policies
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Anon can read nest_visits" ON nest_visits;
DROP POLICY IF EXISTS "Anon can insert nest_visits" ON nest_visits;
DROP POLICY IF EXISTS "Auth can insert nest_visits" ON nest_visits;
DROP POLICY IF EXISTS "Authenticated users can read nest_visits" ON nest_visits;
DROP POLICY IF EXISTS "Authenticated users can insert nest_visits" ON nest_visits;
DROP POLICY IF EXISTS "Anyone can read nest_visits" ON nest_visits;

ALTER TABLE nest_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read nest_visits" ON nest_visits FOR SELECT USING (true);
CREATE POLICY "Anyone can insert nest_visits" ON nest_visits FOR INSERT WITH CHECK (true);

-- -------------------------------------------------------
-- TERRITORY_ASSIGNMENTS — clean up duplicate policies
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read territory_assignments" ON territory_assignments;
DROP POLICY IF EXISTS "Anon can insert territory_assignments" ON territory_assignments;
DROP POLICY IF EXISTS "Anon can update territory_assignments" ON territory_assignments;
DROP POLICY IF EXISTS "Auth can insert territory_assignments" ON territory_assignments;
DROP POLICY IF EXISTS "Auth can update territory_assignments" ON territory_assignments;

ALTER TABLE territory_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read territory_assignments" ON territory_assignments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert territory_assignments" ON territory_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update territory_assignments" ON territory_assignments FOR UPDATE USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- LOOKUP TABLES — read-only access
-- -------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'lookup_failcode', 'lookup_stagfind', 'lookup_sex',
    'lookup_experiment', 'lookup_eggslaid', 'lookup_wholeclutch', 'lookup_filenote'
  ]) LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Anyone can read %I" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "Anyone can read %I" ON %I FOR SELECT USING (true)', tbl, tbl);
  END LOOP;
END $$;

-- -------------------------------------------------------
-- FIX: function search_path warning
-- -------------------------------------------------------
DO $$
BEGIN
  ALTER FUNCTION update_updated_at() SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  -- function doesn't exist, skip
  NULL;
END $$;
