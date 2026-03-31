-- =============================================================================
-- Migration 006: Import conflict staging tables + proofed column
--
-- PROBLEM: When importing historical data from both the survival file and
-- breedfile, a bird (band_id) may appear in both sources with CONFLICTING
-- information (e.g., different sex, natal_year, is_immigrant). Silently
-- skipping or overwriting is DANGEROUS for a 50-year dataset.
--
-- SOLUTION: All historical imports go through a staging + conflict review
-- process. Nothing gets written to working tables without human approval.
--
-- WORKFLOW:
--   1. Import scripts load data into staging tables (staging_birds, etc.)
--   2. A conflict-detection query compares staging rows against existing rows
--   3. Conflicts get inserted into import_conflicts for Katherine to review
--   4. Only conflict-free rows (or manually resolved conflicts) proceed
--      to the working tables
--   5. Every imported row gets logged in import_log for traceability
--
-- Run AFTER migration_005 (field_id).
-- =============================================================================


-- =============================================================================
-- STAGING TABLES
-- Temporary holding area for imported data before it touches working tables.
-- These mirror the working table structure but have NO foreign key constraints
-- so they can hold data that references birds not yet in the system.
-- =============================================================================

CREATE TABLE IF NOT EXISTS staging_birds (
    staging_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch   TEXT NOT NULL,              -- e.g., 'survival_2003_import_20260328'
    source_table   TEXT NOT NULL,              -- 'raw_survival' or 'raw_breed'
    source_row     INTEGER,                    -- Row number in source file

    -- Actual bird data (mirrors birds table)
    band_id        BIGINT NOT NULL,
    sex            INTEGER,
    is_immigrant   INTEGER,
    natal_year     INTEGER,
    notes          TEXT,

    -- Conflict resolution
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'conflict', 'resolved', 'imported', 'skipped')),
    conflict_id    BIGINT,                     -- FK to import_conflicts if status = 'conflict'
    resolution     TEXT,                        -- How it was resolved (if resolved)
    resolved_by    TEXT,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE staging_birds IS 'Staging area for bird records during historical import. Every row must be reviewed before reaching the working birds table.';

CREATE INDEX idx_staging_birds_band_id ON staging_birds(band_id);
CREATE INDEX idx_staging_birds_status ON staging_birds(status);
CREATE INDEX idx_staging_birds_batch ON staging_birds(import_batch);


-- =============================================================================
-- IMPORT CONFLICTS
-- When the same band_id appears with different values from different sources,
-- the conflict is recorded here for manual review.
-- =============================================================================

CREATE TABLE IF NOT EXISTS import_conflicts (
    conflict_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    band_id        BIGINT NOT NULL,
    field_name     TEXT NOT NULL,               -- Which column has the conflict

    -- The conflicting values
    existing_value TEXT,                        -- What's already in working table (or first import)
    existing_source TEXT,                       -- Where existing value came from
    incoming_value TEXT,                        -- What the new import says
    incoming_source TEXT,                       -- Where incoming value came from
    import_batch   TEXT NOT NULL,

    -- Resolution
    status         TEXT NOT NULL DEFAULT 'unresolved'
                   CHECK (status IN ('unresolved', 'resolved_keep_existing', 'resolved_use_incoming',
                                     'resolved_manual', 'resolved_both_wrong')),
    resolved_value TEXT,                        -- Final value after manual review (may differ from both!)
    resolution_note TEXT,                       -- Katherine's explanation of why
    resolved_by    TEXT,
    resolved_at    TIMESTAMPTZ,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE import_conflicts IS 'Conflicts detected during historical data import. Every conflict MUST be manually reviewed — nothing is auto-resolved.';
COMMENT ON COLUMN import_conflicts.resolved_value IS 'The final correct value. May be existing, incoming, or something else entirely after card/record review.';
COMMENT ON COLUMN import_conflicts.resolution_note IS 'Required explanation of why this resolution was chosen. Reference original cards/records when possible.';

CREATE INDEX idx_import_conflicts_band_id ON import_conflicts(band_id);
CREATE INDEX idx_import_conflicts_status ON import_conflicts(status);
CREATE INDEX idx_import_conflicts_batch ON import_conflicts(import_batch);


-- =============================================================================
-- IMPORT LOG
-- Tracks every row that was successfully imported, for full traceability.
-- =============================================================================

CREATE TABLE IF NOT EXISTS import_log (
    log_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch    TEXT NOT NULL,
    target_table    TEXT NOT NULL,              -- 'birds', 'survival', 'breed'
    record_id       TEXT NOT NULL,              -- band_id, survival_id, or breed_id
    source_table    TEXT NOT NULL,              -- 'raw_survival' or 'raw_breed'
    source_row      INTEGER,
    action          TEXT NOT NULL               -- 'insert', 'update', 'skip_duplicate'
                    CHECK (action IN ('insert', 'update', 'skip_duplicate', 'conflict_resolved')),
    details         TEXT,                       -- Any notes about the import
    imported_by     TEXT NOT NULL,
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE import_log IS 'Full audit trail of every row imported from historical files into working tables.';

CREATE INDEX idx_import_log_batch ON import_log(import_batch);
CREATE INDEX idx_import_log_record ON import_log(record_id);


-- =============================================================================
-- PROOFED COLUMN on breed and survival
-- Records start as proofed = FALSE and can only be set TRUE after review.
-- =============================================================================

ALTER TABLE breed ADD COLUMN IF NOT EXISTS proofed BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN breed.proofed IS 'TRUE = this record has been reviewed and verified by Katherine or a senior researcher. Cannot be TRUE until all required fields are filled.';

ALTER TABLE survival ADD COLUMN IF NOT EXISTS proofed BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN survival.proofed IS 'TRUE = this record has been reviewed and verified. Cannot be TRUE until all required fields are filled.';

-- Constraint: breed record cannot be proofed if critical fields are missing
-- (year, male or female must be known, eggs_laid must be answered)
ALTER TABLE breed ADD CONSTRAINT breed_proofed_requires_fields
    CHECK (
        proofed = FALSE
        OR (
            year IS NOT NULL
            AND (male_id IS NOT NULL OR female_id IS NOT NULL)
            AND eggs_laid IS NOT NULL
        )
    );

-- Constraint: survival record cannot be proofed if critical fields are missing
ALTER TABLE survival ADD CONSTRAINT survival_proofed_requires_fields
    CHECK (
        proofed = FALSE
        OR (
            band_id IS NOT NULL
            AND year IS NOT NULL
            AND age IS NOT NULL
            AND sex IS NOT NULL
            AND survived IS NOT NULL
        )
    );


-- =============================================================================
-- RLS for new tables
-- =============================================================================

ALTER TABLE staging_birds ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read staging_birds"
    ON staging_birds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read import_conflicts"
    ON import_conflicts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read import_log"
    ON import_log FOR SELECT TO authenticated USING (true);
