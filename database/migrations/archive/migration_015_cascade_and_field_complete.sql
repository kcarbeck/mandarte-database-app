-- Migration 015: ON UPDATE CASCADE on all birds(band_id) FKs + field_complete on breed
-- Applied: 2026-03-31
--
-- Problem: Unbanded birds (negative band_id) could not be nest parents because the app
-- filtered them out (band_id > 0). When a bird is eventually banded, all references
-- (nests, survival, territory assignments, visits) need to update automatically.
--
-- Solution: Add ON UPDATE CASCADE to all 12 foreign keys referencing birds(band_id).
-- Also add field_complete flag for nest card completion tracking.

-- ── Part 1: ON UPDATE CASCADE ──────────────────────────────────────────

ALTER TABLE banding_records DROP CONSTRAINT banding_records_band_id_fkey;
ALTER TABLE banding_records ADD CONSTRAINT banding_records_band_id_fkey
  FOREIGN KEY (band_id) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE breed DROP CONSTRAINT breed_male_id_fkey;
ALTER TABLE breed ADD CONSTRAINT breed_male_id_fkey
  FOREIGN KEY (male_id) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE breed DROP CONSTRAINT breed_female_id_fkey;
ALTER TABLE breed ADD CONSTRAINT breed_female_id_fkey
  FOREIGN KEY (female_id) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE breed DROP CONSTRAINT breed_kid1_fkey;
ALTER TABLE breed ADD CONSTRAINT breed_kid1_fkey
  FOREIGN KEY (kid1) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE breed DROP CONSTRAINT breed_kid2_fkey;
ALTER TABLE breed ADD CONSTRAINT breed_kid2_fkey
  FOREIGN KEY (kid2) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE breed DROP CONSTRAINT breed_kid3_fkey;
ALTER TABLE breed ADD CONSTRAINT breed_kid3_fkey
  FOREIGN KEY (kid3) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE breed DROP CONSTRAINT breed_kid4_fkey;
ALTER TABLE breed ADD CONSTRAINT breed_kid4_fkey
  FOREIGN KEY (kid4) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE breed DROP CONSTRAINT breed_kid5_fkey;
ALTER TABLE breed ADD CONSTRAINT breed_kid5_fkey
  FOREIGN KEY (kid5) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE survival DROP CONSTRAINT survival_band_id_fkey;
ALTER TABLE survival ADD CONSTRAINT survival_band_id_fkey
  FOREIGN KEY (band_id) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE territory_assignments DROP CONSTRAINT territory_assignments_band_id_fkey;
ALTER TABLE territory_assignments ADD CONSTRAINT territory_assignments_band_id_fkey
  FOREIGN KEY (band_id) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE territory_visits DROP CONSTRAINT territory_visits_male_band_id_fkey;
ALTER TABLE territory_visits ADD CONSTRAINT territory_visits_male_band_id_fkey
  FOREIGN KEY (male_band_id) REFERENCES birds(band_id) ON UPDATE CASCADE;

ALTER TABLE territory_visits DROP CONSTRAINT territory_visits_female_band_id_fkey;
ALTER TABLE territory_visits ADD CONSTRAINT territory_visits_female_band_id_fkey
  FOREIGN KEY (female_band_id) REFERENCES birds(band_id) ON UPDATE CASCADE;

-- ── Part 2: field_complete on breed ────────────────────────────────────

ALTER TABLE breed ADD COLUMN field_complete BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN breed.field_complete IS
'Field crew marks true when nest card is fully filled out (all counts, quality flags, outcome).
Must pass validation before setting. Next step after field_complete is proofed=true by PI.';
