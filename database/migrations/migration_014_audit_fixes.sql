-- Migration 014: Schema audit fixes (2026-03-31)
-- Applied via Supabase migrations: change_field_id_to_bigint, audit_fixes_a1_through_a5, create_banding_records_table

-- B5: Change birds.field_id from INTEGER to BIGINT
ALTER TABLE birds ALTER COLUMN field_id TYPE BIGINT;

-- A1: Fix territory_assignments.role default (was 'resident', violated CHECK)
ALTER TABLE territory_assignments ALTER COLUMN role SET DEFAULT 'territory_holder';

-- A2: Strengthen survival.proofed check constraint
ALTER TABLE survival DROP CONSTRAINT IF EXISTS survival_proofed_requires_fields;
ALTER TABLE survival ADD CONSTRAINT survival_proofed_requires_fields CHECK (
    proofed = FALSE
    OR (
        band_id IS NOT NULL
        AND year IS NOT NULL
        AND age IS NOT NULL
        AND sex IS NOT NULL
        AND survived IS NOT NULL
        AND natal_year IS NOT NULL
        AND experiment IS NOT NULL
    )
);

-- A3: Add historical anomaly codes to lookups
INSERT INTO lookup_failcode (code, description, category) VALUES
    ('0', 'Missing/unassigned (historical)', NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO lookup_stagfind (code, description) VALUES
    ('AF', 'After fail (historical variant of EAF)'),
    ('B', 'Building (historical variant of NB)'),
    ('EG', 'Eggs (historical variant of EL)'),
    ('NY', 'Nestlings/young (historical variant of HY)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO lookup_eggslaid (code, description) VALUES
    ('.', 'Missing/not recorded (historical)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO lookup_quality_flag (code, description, meaning) VALUES
    ('?+', 'Uncertain minimum count (historical)', 'Observer was uncertain but value is at least this high. Compound flag from historical data.'),
    ('?+++', 'Uncertain, likely well above minimum (historical)', 'Observer was uncertain but value is likely much higher. Compound flag from historical data.'),
    ('?-', 'Uncertain, possible overcount (historical)', 'Observer was uncertain and value may be too high. Compound flag from historical data.')
ON CONFLICT (code) DO NOTHING;

-- A3: Add FK constraints on breed lookup columns
ALTER TABLE breed ADD CONSTRAINT breed_stage_find_fkey FOREIGN KEY (stage_find) REFERENCES lookup_stagfind(code);
ALTER TABLE breed ADD CONSTRAINT breed_fail_code_fkey FOREIGN KEY (fail_code) REFERENCES lookup_failcode(code);
ALTER TABLE breed ADD CONSTRAINT breed_eggs_laid_fkey FOREIGN KEY (eggs_laid) REFERENCES lookup_eggslaid(code);
ALTER TABLE breed ADD CONSTRAINT breed_whole_clutch_fkey FOREIGN KEY (whole_clutch) REFERENCES lookup_wholeclutch(code);
ALTER TABLE breed ADD CONSTRAINT breed_file_note_fkey FOREIGN KEY (file_note) REFERENCES lookup_filenote(code);
ALTER TABLE breed ADD CONSTRAINT breed_dfe_quality_fkey FOREIGN KEY (dfe_quality) REFERENCES lookup_quality_flag(code);
ALTER TABLE breed ADD CONSTRAINT breed_eggs_quality_fkey FOREIGN KEY (eggs_quality) REFERENCES lookup_quality_flag(code);
ALTER TABLE breed ADD CONSTRAINT breed_hatch_quality_fkey FOREIGN KEY (hatch_quality) REFERENCES lookup_quality_flag(code);
ALTER TABLE breed ADD CONSTRAINT breed_band_quality_fkey FOREIGN KEY (band_quality) REFERENCES lookup_quality_flag(code);
ALTER TABLE breed ADD CONSTRAINT breed_fledge_quality_fkey FOREIGN KEY (fledge_quality) REFERENCES lookup_quality_flag(code);
ALTER TABLE breed ADD CONSTRAINT breed_indep_quality_fkey FOREIGN KEY (indep_quality) REFERENCES lookup_quality_flag(code);

-- A4: Fix lookup_wholeclutch descriptions
UPDATE lookup_wholeclutch SET description = 'Yes — bird was seen incubating (clutch is complete)' WHERE code = 'Y';
UPDATE lookup_wholeclutch SET description = 'No — bird was not seen incubating, so clutch completeness is uncertain' WHERE code = 'N';

-- A5: Add nest_visits.breed_id FK to breed
ALTER TABLE nest_visits ADD CONSTRAINT nest_visits_breed_id_fkey FOREIGN KEY (breed_id) REFERENCES breed(breed_id);

-- B1: Create banding_records table
CREATE TABLE banding_records (
    banding_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    band_id         BIGINT NOT NULL REFERENCES birds(band_id),
    color_combo     TEXT,
    banding_date    DATE,
    banding_time    TIME,
    age_at_banding  TEXT,
    sex             INTEGER REFERENCES lookup_sex(code),
    weight          DECIMAL(5,1),
    wing            DECIMAL(5,1),
    tarsus          DECIMAL(5,1),
    bill_length     DECIMAL(5,1),
    bill_width      DECIMAL(5,1),
    bill_depth      DECIMAL(5,1),
    observer        TEXT,
    is_recapture    BOOLEAN NOT NULL DEFAULT FALSE,
    nest_breed_id   BIGINT REFERENCES breed(breed_id),
    notes           TEXT,
    proofed         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_banding_records_band_id ON banding_records(band_id);
CREATE INDEX idx_banding_records_date ON banding_records(banding_date);

ALTER TABLE banding_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banding_records_read" ON banding_records FOR SELECT USING (true);
CREATE POLICY "banding_records_insert" ON banding_records FOR INSERT WITH CHECK (true);
CREATE POLICY "banding_records_update" ON banding_records FOR UPDATE USING (true);

COMMENT ON TABLE banding_records IS 'Morphometric measurements taken at banding events. A bird can have multiple records (first banding + recaptures).';
