-- =============================================================================
-- Mandarte Island Song Sparrow Study — PostgreSQL Schema
-- Version: 2.0
-- Date: 2026-03-31
-- Status: AUTO-GENERATED FROM LIVE DATABASE STATE
--
-- This schema encodes the CURRENT live database state. To replicate the live DB
-- from scratch on an empty instance, run this file in sequence, then seed_lookups.sql.
--
-- Architecture:
--   Layer 1 (Immutable Archive): raw_survival, raw_breed, corrections
--   Layer 2 (Working Tables): birds, survival, breed, territory_visits, nest_visits
--   Field App Tables: territory_assignments, territory_visits, nest_visits, banding_records,
--                     field_tasks, planned_actions
--   Staging/Import: staging_birds, import_conflicts, import_log
--   Lookup Tables: lookup_sex, lookup_experiment, lookup_failcode, lookup_stagfind,
--                  lookup_eggslaid, lookup_wholeclutch, lookup_filenote, lookup_quality_flag
--
-- CRITICAL FEATURES:
--   - proofed field: Once set to TRUE, record cannot be modified (admin bypass available)
--   - Temporal fields (created_at, updated_at): All timestamps in UTC
--   - RLS enabled on all tables; role-based access via Supabase Auth
--   - Foreign keys: Cascade or restrict as appropriate
--   - Triggers: protect_*_on_update/delete enforce proofed+year checks
--
-- To deploy: Run this file, then seed_lookups.sql to populate lookup tables.
-- =============================================================================


-- =============================================================================
-- LOOKUP TABLES — Small reference tables for coded fields
-- =============================================================================

CREATE TABLE lookup_sex (
    code        INTEGER PRIMARY KEY,
    description TEXT NOT NULL
);
COMMENT ON TABLE lookup_sex IS 'Lookup: sex codes. 0=unknown, 1=female, 2=male.';


CREATE TABLE lookup_experiment (
    code                  TEXT PRIMARY KEY,
    description           TEXT NOT NULL,
    year_conducted        TEXT,
    exclude_from_analysis BOOLEAN NOT NULL DEFAULT FALSE
);
COMMENT ON TABLE lookup_experiment IS 'Lookup: experiment codes. exclude_from_analysis=true for feeding experiments (3,4.1,4.2,6) that skew survival.';


CREATE TABLE lookup_failcode (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    category    TEXT
);
COMMENT ON TABLE lookup_failcode IS 'Lookup: nest failure cause codes. 24=success, 1-23=failure reasons.';


CREATE TABLE lookup_stagfind (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL
);
COMMENT ON TABLE lookup_stagfind IS 'Lookup: nest stage at discovery (building, laying, incubating, nestling, etc).';


CREATE TABLE lookup_eggslaid (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL
);
COMMENT ON TABLE lookup_eggslaid IS 'Lookup: eggs_laid codes. Y/N/U.';


CREATE TABLE lookup_wholeclutch (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL
);
COMMENT ON TABLE lookup_wholeclutch IS 'Lookup: whole_clutch codes. Y/N.';


CREATE TABLE lookup_filenote (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL
);
COMMENT ON TABLE lookup_filenote IS 'Lookup: special file notes (e.g., PB=partly built nest).';


CREATE TABLE lookup_quality_flag (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    meaning     TEXT NOT NULL
);
COMMENT ON TABLE lookup_quality_flag IS 'Lookup: data quality flags for reproductive counts (., ?, +, -).';


-- =============================================================================
-- WORKING TABLES — Layer 2: Scientists work with these
-- =============================================================================

-- Master bird roster
CREATE TABLE birds (
    band_id              BIGINT PRIMARY KEY,
    sex                  INTEGER REFERENCES lookup_sex(code),
    is_immigrant         INTEGER DEFAULT 0 CHECK (is_immigrant IN (0, 1)),
    natal_year           INTEGER,
    notes                TEXT,
    color_combo          TEXT,
    is_unbanded          BOOLEAN NOT NULL DEFAULT FALSE,
    unbanded_description TEXT,
    field_id             BIGINT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (field_id) WHERE field_id IS NOT NULL
);
COMMENT ON TABLE birds IS 'Master roster of every bird identified on Mandarte Island. band_id is the primary 9-digit metal band number.';
COMMENT ON COLUMN birds.is_immigrant IS '0=resident-hatched, 1=immigrant. NULL in field app (filled during historical import).';
COMMENT ON COLUMN birds.color_combo IS 'Color band combo, e.g., "Y/G RY/W". Identifies unbanded chicks awaiting banding.';
COMMENT ON COLUMN birds.is_unbanded IS 'true=unbanded chick. Needs follow-up for actual banding + metal band assignment.';
COMMENT ON COLUMN birds.field_id IS 'Internal ID from field app. Links field and historical data via band_id.';
COMMENT ON COLUMN birds.sex IS '0=unknown, 1=female, 2=male. Links to lookup_sex table.';
COMMENT ON COLUMN birds.notes IS 'Free-text notes about the bird. May include field observations, behavioral notes, or special circumstances.';


-- Nest attempt records (mirrors breedfile)
CREATE TABLE breed (
    breed_id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nestrec               INTEGER UNIQUE,
    year                  INTEGER NOT NULL CHECK (year >= 1975),
    study_year            INTEGER,
    territory             TEXT,
    brood                  INTEGER,
    male_id               BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    female_id             BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    male_age              TEXT,
    male_attempt          TEXT,
    female_age            TEXT,
    female_attempt        TEXT,
    utm_x                 DOUBLE PRECISION,
    utm_y                 DOUBLE PRECISION,
    orig_x                DOUBLE PRECISION,
    orig_y                DOUBLE PRECISION,
    corr_dfe              INTEGER,
    dfe                   INTEGER,
    dfe_quality           TEXT REFERENCES lookup_quality_flag(code),
    orig_dfe              INTEGER,
    eggs                  INTEGER,
    eggs_quality          TEXT REFERENCES lookup_quality_flag(code),
    hatch                 INTEGER,
    hatch_quality         TEXT REFERENCES lookup_quality_flag(code),
    band                  INTEGER,
    band_quality          TEXT REFERENCES lookup_quality_flag(code),
    fledge                INTEGER,
    fledge_quality        TEXT REFERENCES lookup_quality_flag(code),
    indep                 INTEGER,
    indep_quality         TEXT REFERENCES lookup_quality_flag(code),
    cow_egg               INTEGER,
    cow_hatch             INTEGER,
    cow_band              TEXT,
    cow_fledge            TEXT,
    kid1                  BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    kid2                  BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    kid3                  BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    kid4                  BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    kid5                  BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    stage_find            TEXT REFERENCES lookup_stagfind(code),
    recruits              INTEGER,
    eggs_laid             TEXT REFERENCES lookup_eggslaid(code),
    whole_clutch          TEXT REFERENCES lookup_wholeclutch(code),
    stage_fail            TEXT,
    fail_code             TEXT REFERENCES lookup_failcode(code),
    broke_egg             TEXT,
    experiment            TEXT REFERENCES lookup_experiment(code),
    file_note             TEXT REFERENCES lookup_filenote(code),
    fail_notes            TEXT,
    other_notes           TEXT,
    unhatch               TEXT,
    question_mark_plus_minus TEXT,
    nest_height           TEXT,
    vegetation            TEXT,
    nest_description      TEXT,
    date_hatch            INTEGER,
    proofed               BOOLEAN NOT NULL DEFAULT FALSE,
    field_complete        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (proofed = false OR (year IS NOT NULL AND (male_id IS NOT NULL OR female_id IS NOT NULL) AND eggs_laid IS NOT NULL))
);
COMMENT ON TABLE breed IS 'Nest attempt records. Mirror of breedfile. One row per nest attempt, also includes unmated males with territories.';
COMMENT ON COLUMN breed.band IS 'Number of chicks at banding age (~day 6). NOT the count of chicks banded with metal bands.';
COMMENT ON COLUMN breed.proofed IS 'Once TRUE, cannot modify (admin bypass available). Indicates record reviewed and approved.';
COMMENT ON COLUMN breed.field_complete IS 'Field crew marks true when nest card is fully filled out (all counts, quality flags, outcome). Must pass validation before setting. Next step after field_complete is proofed=true by PI.';
CREATE INDEX idx_breed_year ON breed(year);
CREATE INDEX idx_breed_territory ON breed(territory);
CREATE INDEX idx_breed_male_id ON breed(male_id);
CREATE INDEX idx_breed_female_id ON breed(female_id);


-- Bird-year survival records (mirrors survival file)
CREATE TABLE survival (
    survival_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    band_id      BIGINT NOT NULL REFERENCES birds(band_id) ON UPDATE CASCADE,
    study_year   INTEGER NOT NULL,
    year         INTEGER NOT NULL CHECK (year >= 1975),
    age          INTEGER NOT NULL CHECK (age >= 0 AND age <= 15),
    sex          INTEGER NOT NULL REFERENCES lookup_sex(code),
    survived     INTEGER NOT NULL CHECK (survived IN (0, 1)),
    censored     INTEGER NOT NULL DEFAULT 0 CHECK (censored IN (0, 1)),
    is_immigrant INTEGER NOT NULL DEFAULT 0 CHECK (is_immigrant IN (0, 1)),
    experiment   TEXT DEFAULT '0' REFERENCES lookup_experiment(code),
    natal_year   INTEGER,
    proofed      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (band_id, year),
    CHECK (proofed = false OR (band_id IS NOT NULL AND year IS NOT NULL AND age IS NOT NULL AND sex IS NOT NULL AND survived IS NOT NULL AND natal_year IS NOT NULL AND experiment IS NOT NULL))
);
COMMENT ON TABLE survival IS 'Bird-year records. One row per bird per year alive. Mirrors survival file.';
COMMENT ON COLUMN survival.age IS '0=independent juvenile (day 24+), 1+=adult age. Immigrants assumed age 1 in first year.';
COMMENT ON COLUMN survival.sex IS '0=unknown, 1=female, 2=male. Juveniles always 0 even if sex determined later.';
COMMENT ON COLUMN survival.censored IS '1=censor in survival analyses (killed by experiment or humans).';
COMMENT ON COLUMN survival.proofed IS 'Once TRUE, cannot modify. Indicates record reviewed and approved.';
CREATE INDEX idx_survival_band_id ON survival(band_id);
CREATE INDEX idx_survival_year ON survival(year);


-- Territory assignment history (field app)
CREATE TABLE territory_assignments (
    assignment_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    territory        TEXT NOT NULL,
    year             INTEGER NOT NULL CHECK (year >= 1975),
    band_id          BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    color_combo      TEXT,
    sex              INTEGER NOT NULL REFERENCES lookup_sex(code),
    role             TEXT NOT NULL DEFAULT 'territory_holder' CHECK (role IN ('territory_holder', 'floater')),
    start_date       DATE NOT NULL,
    end_date         DATE,
    departure_reason TEXT CHECK (departure_reason IN ('replaced', 'moved', 'not_seen', 'confirmed_dead', 'became_floater', 'correction')),
    confirmed        BOOLEAN NOT NULL DEFAULT FALSE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE territory_assignments IS 'Territory assignment history. Tracks which bird occupied which territory and when, including role (territory_holder vs floater).';
COMMENT ON COLUMN territory_assignments.assignment_id IS 'Unique identifier for each territory assignment record.';
COMMENT ON COLUMN territory_assignments.territory IS 'Territory code, e.g., "A1", "B2". References the named territory.';
COMMENT ON COLUMN territory_assignments.year IS 'Year of the assignment (breeding season year).';
COMMENT ON COLUMN territory_assignments.band_id IS 'The band ID of the bird assigned to this territory. References birds table.';
COMMENT ON COLUMN territory_assignments.color_combo IS 'Color band combo of the bird, e.g., "Y/G RY/W". Redundant with band_id but cached for quick reference.';
COMMENT ON COLUMN territory_assignments.sex IS 'Sex of the bird: 0=unknown, 1=female, 2=male.';
COMMENT ON COLUMN territory_assignments.role IS 'Role on territory: territory_holder or floater.';
COMMENT ON COLUMN territory_assignments.start_date IS 'Date the bird first occupied this territory.';
COMMENT ON COLUMN territory_assignments.end_date IS 'Date assignment ended. NULL = bird is still on this territory.';
COMMENT ON COLUMN territory_assignments.notes IS 'Free-text notes about the assignment or bird movement.';
CREATE INDEX idx_ta_territory_year ON territory_assignments(territory, year);
CREATE INDEX idx_ta_band_id ON territory_assignments(band_id);
CREATE INDEX idx_ta_current ON territory_assignments(territory, year) WHERE end_date IS NULL;


-- Territory visit log (field app)
CREATE TABLE territory_visits (
    visit_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    territory           TEXT NOT NULL,
    year                INTEGER NOT NULL CHECK (year >= 1975),
    visit_date          DATE NOT NULL,
    visit_time          TIME,
    observer            TEXT NOT NULL,
    male_seen           BOOLEAN,
    male_band_id        BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    male_color_combo    TEXT,
    female_seen         BOOLEAN,
    female_band_id      BIGINT REFERENCES birds(band_id) ON UPDATE CASCADE,
    female_color_combo  TEXT,
    minutes_spent       INTEGER,
    other_birds         JSONB,
    other_birds_notes   TEXT,
    nest_status_flag    TEXT,
    notes               TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE territory_visits IS 'Territory visit log from field app. Equivalent of paper territory card entries. One row per visit.';
COMMENT ON COLUMN territory_visits.other_birds IS 'JSON array of band IDs of other birds seen on territory during visit.';
CREATE INDEX idx_territory_visits_territory ON territory_visits(territory);
CREATE INDEX idx_territory_visits_year ON territory_visits(year);
CREATE INDEX idx_territory_visits_date ON territory_visits(visit_date);


-- Nest visit log (field app)
CREATE TABLE nest_visits (
    nest_visit_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nestrec            INTEGER,
    breed_id           BIGINT REFERENCES breed(breed_id),
    visit_date         DATE NOT NULL,
    visit_time         TIME,
    observer           TEXT NOT NULL,
    nest_stage         TEXT,
    egg_count          INTEGER,
    chick_count        INTEGER,
    chick_age_estimate INTEGER,
    cowbird_eggs       INTEGER,
    cowbird_chicks     INTEGER,
    band_combos_seen   JSONB,
    contents_description TEXT,
    comments           TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (nestrec IS NOT NULL OR breed_id IS NOT NULL)
);
COMMENT ON TABLE nest_visits IS 'Nest observation log from field app. Visit-by-visit record of nest progression. Links to breed via breed_id.';
COMMENT ON COLUMN nest_visits.nest_visit_id IS 'Unique identifier for each nest visit record.';
COMMENT ON COLUMN nest_visits.nestrec IS 'Nest record number (links to breed.nestrec). Optional if breed_id is used.';
COMMENT ON COLUMN nest_visits.visit_date IS 'Date of the nest visit.';
COMMENT ON COLUMN nest_visits.visit_time IS 'Time of day the nest was visited.';
COMMENT ON COLUMN nest_visits.observer IS 'Name or ID of the observer who made the visit.';
COMMENT ON COLUMN nest_visits.egg_count IS 'Number of eggs observed in the nest.';
COMMENT ON COLUMN nest_visits.chick_count IS 'Number of chicks observed in the nest.';
COMMENT ON COLUMN nest_visits.chick_age_estimate IS 'Estimated chick age in days. Day 1 = hatch day. Day 6 = pins breaking (banding age). Used to back-calculate hatch date.';
COMMENT ON COLUMN nest_visits.cowbird_eggs IS 'Number of cowbird eggs observed in the nest.';
COMMENT ON COLUMN nest_visits.cowbird_chicks IS 'Number of cowbird chicks observed in the nest.';
COMMENT ON COLUMN nest_visits.band_combos_seen IS 'JSON array of chick band combos seen during fledge/independence checks.';
COMMENT ON COLUMN nest_visits.contents_description IS 'Text description of nest contents (eggs, chicks, parasites, etc).';
COMMENT ON COLUMN nest_visits.comments IS 'Free-text notes. For independence check visits, auto-includes which specific kids were confirmed independent.';
CREATE INDEX idx_nest_visits_nestrec ON nest_visits(nestrec);
CREATE INDEX idx_nest_visits_breed_id ON nest_visits(breed_id);
CREATE INDEX idx_nest_visits_date ON nest_visits(visit_date);


-- Banding records (field app)
CREATE TABLE banding_records (
    banding_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    band_id          BIGINT NOT NULL REFERENCES birds(band_id) ON UPDATE CASCADE,
    color_combo      TEXT,
    banding_date     DATE,
    banding_time     TIME,
    age_at_banding   TEXT,
    sex              INTEGER REFERENCES lookup_sex(code),
    weight           DECIMAL(5, 1),
    wing             DECIMAL(5, 1),
    tarsus           DECIMAL(5, 1),
    bill_length      DECIMAL(5, 1),
    bill_width       DECIMAL(5, 1),
    bill_depth       DECIMAL(5, 1),
    observer         TEXT,
    is_recapture     BOOLEAN NOT NULL DEFAULT FALSE,
    nest_breed_id    BIGINT REFERENCES breed(breed_id),
    notes            TEXT,
    proofed          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE banding_records IS 'Banding records from field app. Tracks physical measurements and band assignment for each bird.';
COMMENT ON COLUMN banding_records.banding_id IS 'Unique identifier for each banding record.';
COMMENT ON COLUMN banding_records.band_id IS 'The 9-digit metal band number assigned to this bird. References birds table.';
COMMENT ON COLUMN banding_records.color_combo IS 'Color band combination applied during this banding, e.g., "Y/G RY/W".';
COMMENT ON COLUMN banding_records.banding_date IS 'Date the bird was banded.';
COMMENT ON COLUMN banding_records.banding_time IS 'Time of day banding occurred.';
COMMENT ON COLUMN banding_records.age_at_banding IS 'Estimated chick age in days at banding. Day 6 = pins breaking (target banding age).';
COMMENT ON COLUMN banding_records.sex IS 'Sex determined at banding: 0=unknown, 1=female, 2=male.';
COMMENT ON COLUMN banding_records.weight IS 'Body weight in grams, to 1 decimal place.';
COMMENT ON COLUMN banding_records.wing IS 'Wing chord measurement in mm, to 1 decimal place.';
COMMENT ON COLUMN banding_records.tarsus IS 'Tarsus length in mm, to 1 decimal place.';
COMMENT ON COLUMN banding_records.bill_length IS 'Bill length in mm, to 1 decimal place.';
COMMENT ON COLUMN banding_records.bill_width IS 'Bill width in mm, to 1 decimal place.';
COMMENT ON COLUMN banding_records.bill_depth IS 'Bill depth in mm, to 1 decimal place.';
COMMENT ON COLUMN banding_records.observer IS 'Name or ID of the observer who performed the banding.';
COMMENT ON COLUMN banding_records.is_recapture IS 'true if this is a recapture of a previously banded bird; false for first banding.';
COMMENT ON COLUMN banding_records.nest_breed_id IS 'References the nest (breed) from which this chick came, if applicable.';
COMMENT ON COLUMN banding_records.notes IS 'Free-text notes about the banding event or bird condition.';
COMMENT ON COLUMN banding_records.proofed IS 'Once TRUE, cannot modify (admin bypass available). Indicates record reviewed and approved.';
CREATE INDEX idx_banding_records_band_id ON banding_records(band_id);
CREATE INDEX idx_banding_records_date ON banding_records(banding_date);


-- Field task tracking
CREATE TABLE field_tasks (
    task_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    year          INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    title         TEXT NOT NULL,
    notes         TEXT,
    priority      TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),
    completed     BOOLEAN DEFAULT FALSE,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    created_by    TEXT,
    territory     TEXT,
    breed_id      INTEGER REFERENCES breed(breed_id)
);
COMMENT ON TABLE field_tasks IS 'Field task tracking. Task list for field students (visit territories, check nests, etc).';


-- Planned actions (field app)
CREATE TABLE planned_actions (
    action_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    year         INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    territory    TEXT NOT NULL,
    planned_date DATE NOT NULL,
    action_type  TEXT NOT NULL DEFAULT 'visit',
    breed_id     INTEGER REFERENCES breed(breed_id) ON DELETE SET NULL,
    notes        TEXT,
    completed    BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (territory, planned_date, action_type, breed_id)
);
COMMENT ON TABLE planned_actions IS 'Planned field actions. Calendar of upcoming visits, checks, and nest manipulations.';
CREATE INDEX idx_planned_actions_territory ON planned_actions(territory);
CREATE INDEX idx_planned_actions_year ON planned_actions(year);
CREATE INDEX idx_planned_actions_date ON planned_actions(planned_date);


-- =============================================================================
-- IMMUTABLE ARCHIVE — Layer 1: Write-once, never modified
-- =============================================================================

-- Original survival file rows (preserved exactly)
CREATE TABLE raw_survival (
    raw_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    year1        TEXT,
    year2        TEXT,
    age          TEXT,
    sex          TEXT,
    surv         TEXT,
    cens         TEXT,
    is_field     TEXT,
    ninecode     TEXT,
    expt         TEXT,
    natalyr2     TEXT,
    ingested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_file  TEXT NOT NULL,
    source_sheet TEXT,
    source_row   INTEGER
);
COMMENT ON TABLE raw_survival IS 'Immutable archive of original survival file rows. Write-once, never modified.';


-- Original breedfile rows (preserved exactly with original header names)
CREATE TABLE raw_breed (
    raw_id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nestrec                 TEXT,
    "Year"                  TEXT,
    year                    TEXT,
    terr                    TEXT,
    male                    TEXT,
    maleage                 TEXT,
    maleatt                 TEXT,
    female                  TEXT,
    femage                  TEXT,
    fematt                  TEXT,
    brood                   TEXT,
    "UTM_Nest_X"            TEXT,
    "UTM_Nest_Y"            TEXT,
    "orig_Nest_X"           TEXT,
    "orig_Nest_Y"           TEXT,
    "corrDFE"               TEXT,
    dfe                     TEXT,
    dfeq                    TEXT,
    eggs                    TEXT,
    eggsq                   TEXT,
    cowegg                  TEXT,
    hatch                   TEXT,
    hatchq                  TEXT,
    cowhatch                TEXT,
    band                    TEXT,
    bandq                   TEXT,
    cowband                 TEXT,
    fledge                  TEXT,
    fledgeq                 TEXT,
    cowfled                 TEXT,
    indep                   TEXT,
    indepq                  TEXT,
    kid1                    TEXT,
    kid2                    TEXT,
    kid3                    TEXT,
    kid4                    TEXT,
    kid5                    TEXT,
    stagfind                TEXT,
    recruits                TEXT,
    origdfe                 TEXT,
    filenote                TEXT,
    eggslaid                TEXT,
    wholeclutch             TEXT,
    stagfail                TEXT,
    failcode                TEXT,
    brokegg                 TEXT,
    expt                    TEXT,
    failenotes              TEXT,
    othernotes              TEXT,
    "Unhatch"               TEXT,
    "QuestionmarkPlusMinus" TEXT,
    ingested_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_file             TEXT NOT NULL,
    source_sheet            TEXT,
    source_row              INTEGER
);
COMMENT ON TABLE raw_breed IS 'Immutable archive of original breedfile rows. Write-once, never modified. All columns TEXT; original header names preserved.';


-- Audit trail for corrections to working-layer data
CREATE TABLE corrections (
    correction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name    TEXT NOT NULL,
    record_id     TEXT NOT NULL,
    column_name   TEXT NOT NULL,
    old_value     TEXT,
    new_value     TEXT,
    reason        TEXT NOT NULL,
    corrected_by  TEXT NOT NULL,
    corrected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by   TEXT
);
COMMENT ON TABLE corrections IS 'Audit trail for all changes to working-layer data. Corrections require a reason.';
CREATE INDEX idx_corrections_table ON corrections(table_name);
CREATE INDEX idx_corrections_record ON corrections(record_id);


-- =============================================================================
-- STAGING & IMPORT TABLES — Reconcile field app data with historical imports
-- =============================================================================

-- Staging area for birds pending import
CREATE TABLE staging_birds (
    staging_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch  TEXT NOT NULL,
    source_table  TEXT NOT NULL,
    source_row    INTEGER,
    band_id       BIGINT NOT NULL,
    sex           INTEGER,
    is_immigrant  INTEGER,
    natal_year    INTEGER,
    notes         TEXT,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'conflict', 'resolved', 'imported', 'skipped')),
    conflict_id   BIGINT,
    resolution    TEXT,
    resolved_by   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE staging_birds IS 'Staging area for bird records pending import. Flags conflicts for manual review.';
CREATE INDEX idx_staging_birds_batch ON staging_birds(import_batch);
CREATE INDEX idx_staging_birds_band_id ON staging_birds(band_id);
CREATE INDEX idx_staging_birds_status ON staging_birds(status);


-- Import conflict resolution log
CREATE TABLE import_conflicts (
    conflict_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    band_id            BIGINT NOT NULL,
    field_name         TEXT NOT NULL,
    existing_value     TEXT,
    existing_source    TEXT,
    incoming_value     TEXT,
    incoming_source    TEXT,
    import_batch       TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved_keep_existing', 'resolved_use_incoming', 'resolved_manual', 'resolved_both_wrong')),
    resolved_value     TEXT,
    resolution_note    TEXT,
    resolved_by        TEXT,
    resolved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE import_conflicts IS 'Log of conflicting values during import. Tracks resolution of is_immigrant, natal_year discrepancies.';
CREATE INDEX idx_import_conflicts_batch ON import_conflicts(import_batch);
CREATE INDEX idx_import_conflicts_band_id ON import_conflicts(band_id);
CREATE INDEX idx_import_conflicts_status ON import_conflicts(status);


-- Import transaction log
CREATE TABLE import_log (
    log_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch TEXT NOT NULL,
    target_table TEXT NOT NULL,
    record_id    TEXT NOT NULL,
    source_table TEXT NOT NULL,
    source_row   INTEGER,
    action       TEXT NOT NULL CHECK (action IN ('insert', 'update', 'skip_duplicate', 'conflict_resolved')),
    details      TEXT,
    imported_by  TEXT NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE import_log IS 'Transaction log for all import operations. Enables full audit trail of data lineage.';
CREATE INDEX idx_import_log_batch ON import_log(import_batch);
CREATE INDEX idx_import_log_record ON import_log(record_id);


-- =============================================================================
-- ROW-LEVEL SECURITY (Supabase)
-- Role-based access control via Supabase Auth
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE lookup_sex ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_experiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_failcode ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_stagfind ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_eggslaid ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_wholeclutch ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_filenote ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_quality_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE birds ENABLE ROW LEVEL SECURITY;
ALTER TABLE breed ENABLE ROW LEVEL SECURITY;
ALTER TABLE survival ENABLE ROW LEVEL SECURITY;
ALTER TABLE territory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE territory_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE nest_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE banding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_survival ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_breed ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging_birds ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;

-- Lookup tables: read-only for public/anonymous
CREATE POLICY "Anyone can read lookup_sex" ON lookup_sex FOR SELECT USING (true);
CREATE POLICY "Anyone can read lookup_experiment" ON lookup_experiment FOR SELECT USING (true);
CREATE POLICY "Anyone can read lookup_failcode" ON lookup_failcode FOR SELECT USING (true);
CREATE POLICY "Anyone can read lookup_stagfind" ON lookup_stagfind FOR SELECT USING (true);
CREATE POLICY "Anyone can read lookup_eggslaid" ON lookup_eggslaid FOR SELECT USING (true);
CREATE POLICY "Anyone can read lookup_wholeclutch" ON lookup_wholeclutch FOR SELECT USING (true);
CREATE POLICY "Anyone can read lookup_filenote" ON lookup_filenote FOR SELECT USING (true);
CREATE POLICY "Anyone can read lookup_quality_flag" ON lookup_quality_flag FOR SELECT USING (true);

-- Working tables: read for authenticated, insert/update for authenticated (with field app constraints)
CREATE POLICY "Authenticated users can read birds" ON birds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read breed" ON breed FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read survival" ON survival FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read territory_assignments" ON territory_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read territory_visits" ON territory_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read nest_visits" ON nest_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read banding_records" ON banding_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read field_tasks" ON field_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read planned_actions" ON planned_actions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert territory_assignments" ON territory_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update territory_assignments" ON territory_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can insert territory_visits" ON territory_visits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update territory_visits" ON territory_visits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can insert nest_visits" ON nest_visits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update nest_visits" ON nest_visits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can insert banding_records" ON banding_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update banding_records" ON banding_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can insert field_tasks" ON field_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update field_tasks" ON field_tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can insert planned_actions" ON planned_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update planned_actions" ON planned_actions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Raw and staging tables: read/insert for authenticated only (no public access)
CREATE POLICY "Authenticated users can read raw_survival" ON raw_survival FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read raw_breed" ON raw_breed FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert raw_survival" ON raw_survival FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert raw_breed" ON raw_breed FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can read corrections" ON corrections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated and anon can insert corrections" ON corrections FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can read staging_birds" ON staging_birds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert staging_birds" ON staging_birds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can read import_conflicts" ON import_conflicts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert import_conflicts" ON import_conflicts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can read import_log" ON import_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert import_log" ON import_log FOR INSERT TO authenticated WITH CHECK (true);


-- =============================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER birds_updated_at BEFORE UPDATE ON birds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER breed_updated_at BEFORE UPDATE ON breed FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Prevent modification of raw tables (write-once archive)
CREATE OR REPLACE FUNCTION block_raw_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Raw tables are immutable archives. Cannot modify %.%', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_raw_breed_update BEFORE UPDATE ON raw_breed FOR EACH ROW EXECUTE FUNCTION block_raw_modification();
CREATE TRIGGER protect_raw_breed_delete BEFORE DELETE ON raw_breed FOR EACH ROW EXECUTE FUNCTION block_raw_modification();
CREATE TRIGGER protect_raw_survival_update BEFORE UPDATE ON raw_survival FOR EACH ROW EXECUTE FUNCTION block_raw_modification();
CREATE TRIGGER protect_raw_survival_delete BEFORE DELETE ON raw_survival FOR EACH ROW EXECUTE FUNCTION block_raw_modification();

-- Protect birds: block changing is_immigrant (once set) and natal_year (once set); admin can override with session var
CREATE OR REPLACE FUNCTION protect_birds_records()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.is_admin', TRUE) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow NULL → value for is_immigrant, block value → different_value
    IF TG_OP = 'UPDATE' THEN
        IF OLD.is_immigrant IS NOT NULL AND NEW.is_immigrant IS DISTINCT FROM OLD.is_immigrant THEN
            RAISE EXCEPTION 'Cannot change is_immigrant once set (field app leaves NULL for reconciliation)';
        END IF;
        IF OLD.natal_year IS NOT NULL AND NEW.natal_year IS DISTINCT FROM OLD.natal_year THEN
            RAISE EXCEPTION 'Cannot change natal_year once set';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_birds_on_update BEFORE UPDATE ON birds FOR EACH ROW EXECUTE FUNCTION protect_birds_records();

-- Protect birds: block deletes unless admin
CREATE OR REPLACE FUNCTION protect_birds_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.is_admin', TRUE) != 'true' THEN
        RAISE EXCEPTION 'Cannot delete birds records (archive all data)';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_birds_on_delete BEFORE DELETE ON birds FOR EACH ROW EXECUTE FUNCTION protect_birds_delete();

-- Protect breed: block if proofed=TRUE or year < current_year (admin can override)
CREATE OR REPLACE FUNCTION protect_breed_records()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.is_admin', TRUE) = 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.proofed = TRUE THEN
            RAISE EXCEPTION 'Cannot modify proofed breed records';
        END IF;
        IF OLD.year < EXTRACT(YEAR FROM CURRENT_DATE) THEN
            RAISE EXCEPTION 'Cannot modify previous-season breed records';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_breed_on_update BEFORE UPDATE ON breed FOR EACH ROW EXECUTE FUNCTION protect_breed_records();

-- Protect breed: block deletes unless admin
CREATE OR REPLACE FUNCTION protect_breed_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.is_admin', TRUE) != 'true' THEN
        RAISE EXCEPTION 'Cannot delete breed records (archive all data)';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_breed_on_delete BEFORE DELETE ON breed FOR EACH ROW EXECUTE FUNCTION protect_breed_delete();

-- Protect survival: block if proofed=TRUE or year < current_year (admin can override)
CREATE OR REPLACE FUNCTION protect_survival_records()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.is_admin', TRUE) = 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.proofed = TRUE THEN
            RAISE EXCEPTION 'Cannot modify proofed survival records';
        END IF;
        IF OLD.year < EXTRACT(YEAR FROM CURRENT_DATE) THEN
            RAISE EXCEPTION 'Cannot modify previous-season survival records';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_survival_on_update BEFORE UPDATE ON survival FOR EACH ROW EXECUTE FUNCTION protect_survival_records();

-- Protect survival: block deletes unless admin
CREATE OR REPLACE FUNCTION protect_survival_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.is_admin', TRUE) != 'true' THEN
        RAISE EXCEPTION 'Cannot delete survival records (archive all data)';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_survival_on_delete BEFORE DELETE ON survival FOR EACH ROW EXECUTE FUNCTION protect_survival_delete();

-- Protect territory_assignments: block if year < current_year (admin can override)
CREATE OR REPLACE FUNCTION protect_territory_assignments()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.is_admin', TRUE) = 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.year < EXTRACT(YEAR FROM CURRENT_DATE) THEN
        RAISE EXCEPTION 'Cannot modify previous-season territory assignments';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_territory_assignments_update BEFORE UPDATE ON territory_assignments FOR EACH ROW EXECUTE FUNCTION protect_territory_assignments();

-- Protect territory_visits: block if year < current_year (admin can override)
CREATE OR REPLACE FUNCTION protect_territory_visits()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.is_admin', TRUE) = 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.year < EXTRACT(YEAR FROM CURRENT_DATE) THEN
        RAISE EXCEPTION 'Cannot modify previous-season territory visits';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_territory_visits_update BEFORE UPDATE ON territory_visits FOR EACH ROW EXECUTE FUNCTION protect_territory_visits();
