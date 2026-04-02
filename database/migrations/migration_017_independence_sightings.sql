-- Migration 017: Create independence_sightings table
-- Records individual bird independence confirmations.
-- Each row = "this banded juvenile was seen alive at/after day 22"
-- Properly normalized: independence is a fact about a bird, not a nest column.

CREATE TABLE independence_sightings (
  sighting_id SERIAL PRIMARY KEY,
  band_id BIGINT NOT NULL REFERENCES birds(band_id) ON UPDATE CASCADE,
  breed_id INTEGER NOT NULL REFERENCES breed(breed_id),
  sighting_date DATE,
  sighting_jd INTEGER,
  observer TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_independence_sightings_breed ON independence_sightings(breed_id);
CREATE INDEX idx_independence_sightings_band ON independence_sightings(band_id);
CREATE UNIQUE INDEX idx_independence_sightings_unique
  ON independence_sightings(band_id, breed_id);

ALTER TABLE independence_sightings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read" ON independence_sightings
  FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert" ON independence_sightings
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update" ON independence_sightings
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete" ON independence_sightings
  FOR DELETE TO anon USING (true);
