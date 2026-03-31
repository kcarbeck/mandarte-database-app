-- =============================================================================
-- Migration 001: Add color band combos and update field app support
-- Run this in Supabase SQL Editor AFTER schema.sql and seed_lookups.sql
--
-- Changes:
--   1. Add color_combo column to birds table
--   2. Add color combo columns to territory_visits
--   3. Add nest description fields to breed table (nest_height, vegetation, nest_description)
--   4. Add RLS policies for field student insert/update operations
-- =============================================================================

-- 1. Birds: add color band combo
ALTER TABLE birds ADD COLUMN IF NOT EXISTS color_combo TEXT;
COMMENT ON COLUMN birds.color_combo IS 'Color band combination. Read order: left top, left bottom . right top, right bottom. Example: dbm.gr = dark blue + metal (left), green + red (right).';

-- 2. Territory visits: store color combos seen (students identify birds by color in the field)
ALTER TABLE territory_visits ADD COLUMN IF NOT EXISTS male_color_combo TEXT;
ALTER TABLE territory_visits ADD COLUMN IF NOT EXISTS female_color_combo TEXT;
ALTER TABLE territory_visits ADD COLUMN IF NOT EXISTS other_birds_notes TEXT;
COMMENT ON COLUMN territory_visits.male_color_combo IS 'Color band combo of male seen on territory. Mirrors birds.color_combo.';
COMMENT ON COLUMN territory_visits.female_color_combo IS 'Color band combo of female seen on territory. Mirrors birds.color_combo.';
COMMENT ON COLUMN territory_visits.other_birds_notes IS 'Free-text notes about other birds seen (color combos, behavior).';

-- 3. Breed: add nest description fields from PRD that were missing
ALTER TABLE breed ADD COLUMN IF NOT EXISTS nest_height TEXT;
ALTER TABLE breed ADD COLUMN IF NOT EXISTS vegetation TEXT;
ALTER TABLE breed ADD COLUMN IF NOT EXISTS nest_description TEXT;
ALTER TABLE breed ADD COLUMN IF NOT EXISTS date_hatch INTEGER;
COMMENT ON COLUMN breed.nest_height IS 'Height of nest. Free text to allow units.';
COMMENT ON COLUMN breed.vegetation IS 'Description of vegetation around/supporting nest.';
COMMENT ON COLUMN breed.nest_description IS 'Description of the nest itself.';
COMMENT ON COLUMN breed.date_hatch IS 'Date of hatch as Julian day. Used with clutch size to back-calculate DFE.';

-- 4. RLS policies for field app operations
-- Allow authenticated users to insert birds (for registering new/unbanded birds)
CREATE POLICY "Authenticated users can insert birds"
    ON birds FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to update birds (for adding band info to unbanded birds)
CREATE POLICY "Authenticated users can update birds"
    ON birds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow authenticated users to insert breed records (creating nest cards)
CREATE POLICY "Authenticated users can insert breed"
    ON breed FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to update breed records (updating nest card fields)
CREATE POLICY "Authenticated users can update breed"
    ON breed FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow anon access for development (remove or restrict in production)
CREATE POLICY "Anon can read birds" ON birds FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert birds" ON birds FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update birds" ON birds FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read breed" ON breed FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert breed" ON breed FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update breed" ON breed FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read territory_visits" ON territory_visits FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert territory_visits" ON territory_visits FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can read nest_visits" ON nest_visits FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert nest_visits" ON nest_visits FOR INSERT TO anon WITH CHECK (true);
