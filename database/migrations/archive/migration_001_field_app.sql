-- =============================================================================
-- Migration 001: Field App Support
-- Run in Supabase SQL Editor AFTER schema.sql and seed_lookups.sql
-- Safe to re-run — uses IF NOT EXISTS and DROP POLICY IF EXISTS
--
-- Creates:
--   1. territory_assignments — timeline of which bird is on which territory
--   2. Adds color_combo + placeholder support to birds table
--   3. Adds nest description fields to breed table
--   4. RLS policies for all field app operations
-- =============================================================================

-- -------------------------------------------------------
-- 1. BIRDS TABLE — add color_combo and placeholder support
-- -------------------------------------------------------
ALTER TABLE birds ADD COLUMN IF NOT EXISTS color_combo TEXT;
ALTER TABLE birds ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE birds ADD COLUMN IF NOT EXISTS placeholder_description TEXT;

COMMENT ON COLUMN birds.color_combo IS 'Color band combination. Read order: left top, left bottom . right top, right bottom. Example: dbm.gr';
COMMENT ON COLUMN birds.is_placeholder IS 'TRUE for unbanded birds awaiting banding. band_id will be a temporary negative number.';
COMMENT ON COLUMN birds.placeholder_description IS 'Human-readable description for placeholder birds, e.g. "Unbanded male on Terr 12"';

-- Sequence for generating temporary negative IDs for unbanded birds
CREATE SEQUENCE IF NOT EXISTS unbanded_bird_seq START WITH 1 INCREMENT BY 1;

-- -------------------------------------------------------
-- 2. TERRITORY_ASSIGNMENTS — the timeline
-- One row per bird-territory assignment period.
-- end_date IS NULL means "currently assigned here."
-- When something changes, set end_date + departure_reason
-- on the old row, create a new row for the new situation.
-- Previous visit records remain untouched.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS territory_assignments (
    assignment_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    territory       TEXT NOT NULL,
    year            INTEGER NOT NULL CHECK (year >= 1975),
    band_id         BIGINT REFERENCES birds(band_id),  -- NULL only for unbanded placeholder
    color_combo     TEXT,                                -- snapshot at time of assignment
    sex             INTEGER NOT NULL,                    -- 1 = female, 2 = male
    role            TEXT NOT NULL DEFAULT 'resident'     -- resident, floater
                    CHECK (role IN ('resident', 'floater')),
    start_date      DATE NOT NULL,
    end_date        DATE,                                -- NULL = still current
    departure_reason TEXT                                -- replaced, moved, not_seen, confirmed_dead, floater
                    CHECK (departure_reason IS NULL OR departure_reason IN (
                        'replaced', 'moved', 'not_seen', 'confirmed_dead', 'became_floater', 'correction'
                    )),
    confirmed       BOOLEAN NOT NULL DEFAULT FALSE,      -- TRUE once identity is confirmed
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE territory_assignments IS 'Timeline of bird-territory assignments. Each row = one bird on one territory for a date range. end_date NULL = current. Never delete rows — end them and create new ones.';
COMMENT ON COLUMN territory_assignments.departure_reason IS 'Why this assignment ended: replaced (new bird took over), moved (bird went to different territory), not_seen (disappeared), confirmed_dead, became_floater, correction (identity was wrong).';
COMMENT ON COLUMN territory_assignments.confirmed IS 'TRUE once color combo and identity have been confirmed for the season.';

CREATE INDEX IF NOT EXISTS idx_ta_territory_year ON territory_assignments(territory, year);
CREATE INDEX IF NOT EXISTS idx_ta_band_id ON territory_assignments(band_id);
CREATE INDEX IF NOT EXISTS idx_ta_current ON territory_assignments(territory, year) WHERE end_date IS NULL;

-- -------------------------------------------------------
-- 3. BREED TABLE — add nest description fields from PRD
-- -------------------------------------------------------
ALTER TABLE breed ADD COLUMN IF NOT EXISTS nest_height TEXT;
ALTER TABLE breed ADD COLUMN IF NOT EXISTS vegetation TEXT;
ALTER TABLE breed ADD COLUMN IF NOT EXISTS nest_description TEXT;
ALTER TABLE breed ADD COLUMN IF NOT EXISTS date_hatch INTEGER;

COMMENT ON COLUMN breed.nest_height IS 'Height of nest. Free text.';
COMMENT ON COLUMN breed.vegetation IS 'Vegetation description around/supporting nest.';
COMMENT ON COLUMN breed.nest_description IS 'Description of the nest itself.';
COMMENT ON COLUMN breed.date_hatch IS 'Date of hatch as Julian day. Used with clutch size to back-calculate DFE.';

-- -------------------------------------------------------
-- 4. TERRITORY_VISITS — add color combo columns for snapshot
-- -------------------------------------------------------
ALTER TABLE territory_visits ADD COLUMN IF NOT EXISTS male_color_combo TEXT;
ALTER TABLE territory_visits ADD COLUMN IF NOT EXISTS female_color_combo TEXT;
ALTER TABLE territory_visits ADD COLUMN IF NOT EXISTS other_birds_notes TEXT;

-- -------------------------------------------------------
-- 5. RLS POLICIES — enable field app read/write
-- Uses DROP IF EXISTS + CREATE to be safely re-runnable
-- -------------------------------------------------------

-- Territory assignments
ALTER TABLE territory_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read territory_assignments" ON territory_assignments;
CREATE POLICY "Anyone can read territory_assignments" ON territory_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon can insert territory_assignments" ON territory_assignments;
CREATE POLICY "Anon can insert territory_assignments" ON territory_assignments FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update territory_assignments" ON territory_assignments;
CREATE POLICY "Anon can update territory_assignments" ON territory_assignments FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth can insert territory_assignments" ON territory_assignments;
CREATE POLICY "Auth can insert territory_assignments" ON territory_assignments FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Auth can update territory_assignments" ON territory_assignments;
CREATE POLICY "Auth can update territory_assignments" ON territory_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Birds — allow field app to create and update
DROP POLICY IF EXISTS "Anon can read birds" ON birds;
CREATE POLICY "Anon can read birds" ON birds FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can insert birds" ON birds;
CREATE POLICY "Anon can insert birds" ON birds FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update birds" ON birds;
CREATE POLICY "Anon can update birds" ON birds FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Breed — allow field app to create and update nest cards
DROP POLICY IF EXISTS "Anon can read breed" ON breed;
CREATE POLICY "Anon can read breed" ON breed FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can insert breed" ON breed;
CREATE POLICY "Anon can insert breed" ON breed FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update breed" ON breed;
CREATE POLICY "Anon can update breed" ON breed FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Territory visits
DROP POLICY IF EXISTS "Anon can read territory_visits" ON territory_visits;
CREATE POLICY "Anon can read territory_visits" ON territory_visits FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can insert territory_visits" ON territory_visits;
CREATE POLICY "Anon can insert territory_visits" ON territory_visits FOR INSERT TO anon WITH CHECK (true);

-- Nest visits
DROP POLICY IF EXISTS "Anon can read nest_visits" ON nest_visits;
CREATE POLICY "Anon can read nest_visits" ON nest_visits FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can insert nest_visits" ON nest_visits;
CREATE POLICY "Anon can insert nest_visits" ON nest_visits FOR INSERT TO anon WITH CHECK (true);

-- Lookup tables — read-only for everyone
DROP POLICY IF EXISTS "Anon can read lookup_failcode" ON lookup_failcode;
CREATE POLICY "Anon can read lookup_failcode" ON lookup_failcode FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can read lookup_stagfind" ON lookup_stagfind;
CREATE POLICY "Anon can read lookup_stagfind" ON lookup_stagfind FOR SELECT TO anon USING (true);

-- Authenticated policies for same tables
DROP POLICY IF EXISTS "Auth can insert birds" ON birds;
CREATE POLICY "Auth can insert birds" ON birds FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Auth can update birds" ON birds;
CREATE POLICY "Auth can update birds" ON birds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth can insert breed" ON breed;
CREATE POLICY "Auth can insert breed" ON breed FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Auth can update breed" ON breed;
CREATE POLICY "Auth can update breed" ON breed FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
