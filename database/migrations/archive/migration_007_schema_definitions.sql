-- =============================================================================
-- Migration 007: Comprehensive schema definitions from protocol & readmes
--
-- Makes the database self-documenting so nobody needs to refer back to
-- breedfile_explanations.txt, survival_file_description.txt, or the 2004
-- Monitoring Protocol by Simone Runyan.
--
-- Contents:
--   1. DFE column definitions with exact calculation formulas
--   2. Reproductive count definitions (#B, #F, #I) per protocol
--   3. Uncertainty flag definitions and lookup table
--   4. Stage-of-find and fail-code enriched comments
--   5. Survival column definitions
--
-- Run AFTER migration_006.
-- =============================================================================


-- =============================================================================
-- 0. SCHEMA FIXES — Add missing columns used by the field app
-- =============================================================================

-- These columns are used in the nest card form but were missing from the breed table.
-- Without them, field data is SILENTLY LOST on save.
ALTER TABLE breed ADD COLUMN IF NOT EXISTS date_hatch INTEGER;
COMMENT ON COLUMN breed.date_hatch IS
'Julian day of estimated hatch date. DERIVED — not directly observed.
Back-calculated from nest visits: date_hatch = visit_date - chick_age_estimate.
Most reliable when chick aged at Day 5-7 (pin feather stages):
  Day 5 = pins visible but not broken through sheaths
  Day 6 = pins breaking through sheaths (BANDING AGE — most reliable reference)
  Day 7 = pins well broken through
Ages estimated from Day 1-4 are less reliable (protocol warns common mistakes).
Once date_hatch is known, DFE is auto-calculated:
  DFE = date_hatch - 13 - (clutch_size - 1)
NULL for historical records (hatch date was used to calculate DFE then discarded).
NULL if hatch date cannot be reliably estimated from available observations.';

ALTER TABLE breed ADD COLUMN IF NOT EXISTS nest_height DOUBLE PRECISION;
COMMENT ON COLUMN breed.nest_height IS
'Height of nest above ground in meters. Recorded during nest discovery.
Protocol: "record the height of the nest from the ground to the lip of the nest cup."';

ALTER TABLE breed ADD COLUMN IF NOT EXISTS vegetation TEXT;
COMMENT ON COLUMN breed.vegetation IS
'Plant species or substrate the nest is built in. Free text, e.g., "Rosa nutkana",
"Symphoricarpos albus", "blackberry thicket". Useful for habitat analysis.';

ALTER TABLE breed ADD COLUMN IF NOT EXISTS nest_description TEXT;
COMMENT ON COLUMN breed.nest_description IS
'Free-text description of nest location and structure. E.g., "2m up in rose bush,
exposed side faces north, old nest from last year below."';


-- =============================================================================
-- 0b. FIX: survival proofed constraint — remove redundant NOT NULL checks
-- The checked columns (band_id, year, age, sex, survived) are ALL already
-- defined as NOT NULL in the survival table, so the constraint was misleading.
-- Replace with a meaningful constraint that checks experiment is documented.
-- =============================================================================

ALTER TABLE survival DROP CONSTRAINT IF EXISTS survival_proofed_requires_fields;
ALTER TABLE survival ADD CONSTRAINT survival_proofed_requires_fields
    CHECK (
        proofed = FALSE
        OR (
            natal_year IS NOT NULL
            AND experiment IS NOT NULL
        )
    );


-- =============================================================================
-- 0c. Add COMMENTs for columns that were missing documentation
-- =============================================================================

COMMENT ON COLUMN breed.breed_id IS 'Auto-generated surrogate primary key for the breed table. Internal use only — use nestrec to reference nest attempts.';
COMMENT ON COLUMN breed.nestrec IS 'Unique nest-attempt ID from the historical breedfile. NULL for unmated male territory-holder entries (rows that track a male who held territory but did not nest).';
COMMENT ON COLUMN breed.year IS 'Calendar year of the nest attempt.';
COMMENT ON COLUMN breed.study_year IS 'Study-year index where 1 = 1975, 2 = 1976, etc. Matches survival.study_year.';
COMMENT ON COLUMN breed.male_id IS 'Band ID (ninecode) of the male parent. Links to birds.band_id. NULL if male unknown or not banded.';
COMMENT ON COLUMN breed.female_id IS 'Band ID (ninecode) of the female parent. Links to birds.band_id. NULL if female unknown or for unmated male entries.';
COMMENT ON COLUMN survival.survival_id IS 'Auto-generated surrogate primary key for the survival table. Internal use only — use (band_id, year) to reference specific bird-year records.';


-- =============================================================================
-- 1. DFE COLUMNS — Exact protocol definitions and calculation formulas
-- =============================================================================

COMMENT ON COLUMN breed.dfe IS
'Date of First Egg (Julian day of year). Working estimate.
CALCULATION (count back from hatch date):
  - For clutch of 2 eggs:  DFE = date_of_hatch - 14  (13 days incubation + 1 egg laid)
  - For clutch of 3 eggs:  DFE = date_of_hatch - 15  (13 days incubation + 2 days laying)
  - For clutch of 4 eggs:  DFE = date_of_hatch - 16  (13 days incubation + 3 days laying)
  - General formula:       DFE = date_of_hatch - 13 - (clutch_size - 1)
  - Assumes 13 days incubation, 1 egg laid per day.
ALTERNATIVE (count back from egg laying):
  - If nest found with incomplete clutch during laying, DFE can be estimated
    directly: DFE = date_observed - (eggs_present - 1), since 1 egg/day.
LEAP YEAR WARNING: Julian day 60 = Feb 29 in leap years (1976, 1980, 1984,
  1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024, 2028...).
  All date arithmetic must use actual calendar dates, not naive day counts.
NOTE ON 4-EGG CLUTCHES: The protocol text says "subtract 15 for 3 OR 4 eggs"
  (grouping them), but the formula DFE = DH - 13 - (CS - 1) gives -16 for 4 eggs.
  We use the formula because the breedfile README and the parenthetical explanation
  ("13 days incubation + 1 egg per day") both support it. Confirm with Peter Arcese
  which convention was actually used in historical data.
HISTORICAL NOTE: Pre-1990s, DFE only entered when directly observed. Post-1990s,
  inferred within ±3.5 days from territory/nest card observations.';

COMMENT ON COLUMN breed.corr_dfe IS
'Corrected DFE from Peter Arcese''s 2014 review (Julian day of year).
PREFERRED for analyses when present. Differences from dfe are generally small
but can be larger in earlier records. If both dfe and corr_dfe exist and differ
materially, inspect original nest cards.
Same calculation formula as dfe — corrections come from re-examining original
nest/territory cards with more careful stage-transition dating.';

COMMENT ON COLUMN breed.dfe_quality IS
'Uncertainty flag for the dfe column.
  NULL or "." = no flag, DFE is considered reliable
  "?" = uncertain — observer could not confidently estimate DFE
  "+" = minimum estimate — true DFE might be earlier (more eggs possible)
  "-" = possible overcount — true DFE might be later
HISTORY: The q columns were introduced by Amy Marr because different analyses
had different tolerances for uncertainty. Not consistently maintained across
all years. Retain for backward compatibility.';

COMMENT ON COLUMN breed.orig_dfe IS
'Pre-harmonization DFE value. DO NOT USE FOR ANALYSIS.
Retained solely for understanding why older analyses may have produced
slightly different results. DFE entry standards varied across observers —
some required much higher certainty than others.';


-- =============================================================================
-- 2. REPRODUCTIVE COUNT DEFINITIONS — Per 2004 Monitoring Protocol
-- =============================================================================

COMMENT ON COLUMN breed.eggs IS
'Number of Song Sparrow eggs observed in the nest.
If nest found during incubation and whole_clutch = "Y" (female seen incubating),
this is the true clutch size. If whole_clutch = "N", this is a minimum count.
During backfill harmonization, partial counts were entered as minimums even
for nests found after laying, so analysts should filter on stage_find and
whole_clutch to control for observation bias.';

COMMENT ON COLUMN breed.eggs_quality IS
'Uncertainty flag for eggs count.
  NULL or "." = reliable count
  "?" = uncertain — e.g., cowbird egg present, can''t be sure of SOSP count pre-parasitism
  "+" = minimum — a few more eggs possible (nest not observed during full laying)
  "-" = possible overcount';

COMMENT ON COLUMN breed.hatch IS
'Number of Song Sparrow eggs that hatched. Counted on first visit after hatching.';

COMMENT ON COLUMN breed.hatch_quality IS
'Uncertainty flag for hatch count. Same codes as eggs_quality.';

COMMENT ON COLUMN breed.band IS
'Number of chicks banded at this nest. Banding typically occurs around Day 6
(pin feathers breaking through sheaths).
UNBANDED CHICK TRACKING: If band < hatch - unhatch, there are unbanded chicks:
  # unbanded = hatch - unhatch - band
These unbanded chicks should be tracked and banding attempted later as
fledglings or independent young within the same season, or the following year.
Genetics may later be used to assign unbanded birds back to their natal nest
or identify them as immigrants.
Each banded chick must have both a color band combo and a metal band number
(ninecode) recorded. These are entered as kid1-kid5 linking to the birds table.
HISTORICAL NOTE: The protocol defines #B as "number that reached Day 6,
NOT the number banded." For historical data, #B may reflect the Day 6 count
rather than the actual banding count. For new field data (2026+), record
how many were actually banded so unbanded chicks are flagged for follow-up.';

COMMENT ON COLUMN breed.band_quality IS
'Uncertainty flag for band (Day 6) count. Same codes as eggs_quality.';

COMMENT ON COLUMN breed.fledge IS
'Number of chicks counted at the fledge check (typically Day 12-14).
This count can be updated throughout the season as more sightings occur.
Protocol: "#F is the number of chicks counted in the fledge check around
day 12 or seen after this date."
For backfilled data: if indep is known and fledge was unknown, fledge = indep.';

COMMENT ON COLUMN breed.fledge_quality IS
'Uncertainty flag for fledge count. Same codes as eggs_quality.';

COMMENT ON COLUMN breed.indep IS
'Number of chicks that reached independence (typically checked Day 22-24).
This count can be updated throughout the season as more sightings occur.
Protocol: "#I is the number of chicks that reached day 22-24, or were seen
after this date."
This is the key reproductive success metric — young that survived to leave
parental care and can potentially be resighted as adults.
For backfilled data: if indep is known and band/fledge were unknown,
band = fledge = indep (conservative backfill).';

COMMENT ON COLUMN breed.indep_quality IS
'Uncertainty flag for indep count. Same codes as eggs_quality.';


-- =============================================================================
-- 3. UNCERTAINTY FLAG LOOKUP TABLE
-- Makes the database self-documenting for all q/quality columns.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lookup_quality_flag (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    meaning     TEXT NOT NULL
);

COMMENT ON TABLE lookup_quality_flag IS
'Defines uncertainty/quality flags used in dfe_quality, eggs_quality, hatch_quality,
band_quality, fledge_quality, and indep_quality columns across the breed table.
Originally from Amy Marr''s notation system, extended for database use.';

INSERT INTO lookup_quality_flag (code, description, meaning) VALUES
    ('.', 'No flag', 'Value is considered reliable. Default state.'),
    ('?', 'Uncertain', 'Observer could not confidently determine the count. Use with caution in analyses requiring high certainty.'),
    ('+', 'Minimum count', 'True value might be higher. E.g., nest not observed during complete laying, so egg count is a minimum.'),
    ('-', 'Possible overcount', 'True value might be lower. Rare — used when observer suspects count may include error.')
ON CONFLICT (code) DO NOTHING;

-- RLS (idempotent — drop first so re-runs don't fail)
ALTER TABLE lookup_quality_flag ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read lookup_quality_flag" ON lookup_quality_flag;
CREATE POLICY "Anyone can read lookup_quality_flag"
    ON lookup_quality_flag FOR SELECT USING (true);


-- =============================================================================
-- 4. COWBIRD FIELD DEFINITIONS
-- =============================================================================

COMMENT ON COLUMN breed.cow_egg IS
'Number of Brown-headed Cowbird eggs found in nest. Cowbird parasitism is
a major driver of nest failure on Mandarte. Parallel to eggs count for SOSP.';

COMMENT ON COLUMN breed.cow_hatch IS
'Number of cowbird eggs that hatched. Parallel to hatch count for SOSP.';

COMMENT ON COLUMN breed.cow_band IS
'Number of cowbird chicks reaching Day 6. TEXT type to preserve original data
which may contain notes or uncertainty markers.';

COMMENT ON COLUMN breed.cow_fledge IS
'Number of cowbird chicks that fledged. TEXT type to preserve original data.';


-- =============================================================================
-- 5. NEST OUTCOME FIELD DEFINITIONS
-- =============================================================================

COMMENT ON COLUMN breed.stage_find IS
'Stage of the nest when first discovered by observer.
Codes: NB = nest building, EL = egg laying, IC = incubating,
  HY = hatched young (nestlings present), FY = fledged young,
  MTD = found empty but shows signs it once had eggs,
  MTUK = found empty — either never used or already failed,
  EAF = eggs/shells present but nest found after failure,
  NFN = never found nest (breeding inferred from observations),
  UK = unknown (observations too confusing to assign stage).
CRITICAL FOR ANALYSIS: Filter on stage_find to control observation bias.
Nests found late (HY, FY) have survived longer by definition.';

COMMENT ON COLUMN breed.stage_fail IS
'Stage at which the nest failed (if it failed). Same code system as stage_find.';

COMMENT ON COLUMN breed.fail_code IS
'Why the nest failed. See lookup_failcode for full descriptions.
Key codes: 1-7 = predation signs, 8 = female died, 9-11 = abandonment,
12 = empty intact, 13-17 = combination signs, 18-20 = nestling death/predation,
21 = hatched young disappeared, 22 = human/experiment, 23 = other,
24 = SUCCESS (not a failure — nest produced fledglings).';

COMMENT ON COLUMN breed.eggs_laid IS
'Were eggs laid in this nest? Y = yes, N = no, U = unknown.
Important for counting true nesting attempts vs. nests abandoned
during building.';

COMMENT ON COLUMN breed.whole_clutch IS
'Was the entire clutch observed? Y = yes (female seen INCUBATING the nest,
so egg count = true clutch size). N = no or uncertain (female not seen
incubating, so egg count may be incomplete).
IMPORTANT: "Y" requires the bird to have been seen INCUBATING, not just
that eggs were counted.';

COMMENT ON COLUMN breed.recruits IS
'Number of young from this attempt that later recruited into the breeding
population. Post-2003 this is mostly NULL because recruitment is tracked
primarily via the survival file. For analysis, derive recruits as a query:
count kid1-kid5 that appear in survival with age >= 1.';

COMMENT ON COLUMN breed.brood IS
'Successful brood sequence number for the pair/territory in the season.
E.g., brood = 2 means this was the second successful brood.';

COMMENT ON COLUMN breed.male_age IS
'Age of the male in years. TEXT type because original data contains
non-numeric values (e.g., "1+" for uncertain age). Cross-reference
with survival file for verified ages.';

COMMENT ON COLUMN breed.female_age IS
'Age of the female in years. TEXT type — same notes as male_age.';

COMMENT ON COLUMN breed.male_attempt IS
'Male''s attempt number within the season. E.g., 2 = his second nest attempt.
TEXT type to preserve original data including uncertainty markers.';

COMMENT ON COLUMN breed.female_attempt IS
'Female''s attempt number within the season. TEXT type — same notes as male_attempt.';

COMMENT ON COLUMN breed.broke_egg IS
'Number of broken eggs found in or near nest. TEXT type to preserve
original data which may contain notes.';

COMMENT ON COLUMN breed.experiment IS
'Experiment code. See lookup_experiment for full descriptions.
CRITICAL: Experiments 3, 4.1, 4.2, and 6 are feeding experiments that
MUST be excluded from most analyses. Experiment 8 (temperature probe)
disrupted 3 specific nests in 1997-1998.';

COMMENT ON COLUMN breed.file_note IS
'Special file notation. PB = partly built nest — should NOT be counted
as a true nesting attempt in cumulative attempt counts. Only entered
in some years, so absence of PB does not mean the nest was complete.';

COMMENT ON COLUMN breed.fail_notes IS
'Free-text elaboration on the failure cause. May contain observer notes
about predator identity, specific damage observed, etc.';

COMMENT ON COLUMN breed.other_notes IS
'General free-text notes about the nest attempt.';

COMMENT ON COLUMN breed.unhatch IS
'Free-text/count of unhatched eggs. May contain descriptions like
"fertilized d7", "1 unfertilized", etc.';

COMMENT ON COLUMN breed.question_mark_plus_minus IS
'Legacy column storing ? / + / - flags from the original breedfile where
they were in a column literally named "? / + / -". Renamed for SQL
compatibility. Historical artifact — meaning unclear for all rows.';


-- =============================================================================
-- 6. SURVIVAL TABLE COLUMN DEFINITIONS
-- =============================================================================

COMMENT ON COLUMN survival.band_id IS
'9-digit metal band number (ninecode). Links to birds.band_id.';

COMMENT ON COLUMN survival.study_year IS
'Study-year index where 1 = 1975, 2 = 1976, etc.';

COMMENT ON COLUMN survival.year IS
'Calendar year for this record.';

COMMENT ON COLUMN survival.age IS
'Bird age in years.
  0 = independent juvenile (band combo seen at or after Day 24).
  1 = first adult year (all immigrants assumed age 1 in first year seen).
  2+ = subsequent years.
Immigrants do NOT get an age-0 row. All other birds do (if seen after Day 24).
Ages in the survival file are believed correct; ages in the breed file may
contain errors.';

COMMENT ON COLUMN survival.sex IS
'Sex code: 0 = unknown, 1 = female, 2 = male.
All age-0 birds get sex = 0, even if the sex is later determined.
This convention is maintained for consistency with the original file.';

COMMENT ON COLUMN survival.survived IS
'Did this bird survive to the NEXT year?
  1 = yes, bird was confirmed alive the following spring.
  0 = no, bird was not seen the following year (presumed dead).
Confirmation requires two independent sightings or a very confident
sighting (caught in net, bands double-checked, movement mapped by
skilled observer) after April 1.';

COMMENT ON COLUMN survival.censored IS
'Should this bird-year be censored in survival analyses?
  1 = yes, censor (bird killed in experiment, died in net, etc.)
  0 = no, include normally.
Birds killed in experiments are censored per Lukas Keller''s protocol.';

COMMENT ON COLUMN survival.is_immigrant IS
'Immigration status: 1 = immigrant (not hatched on island), 0 = resident-hatched.
Immigrant age is assumed to be 1 in the first year they are seen on the island.';

COMMENT ON COLUMN survival.experiment IS
'Experiment code from the feeding/disturbance experiments.
  0 = not in any experiment
  3 = fed by Jamie (1979)
  4.1 = Peter''s 1985 feeding experiment — neighbor
  4.2 = Peter''s 1985 feeding experiment — fed bird
  6 = Wes''s 1988 feeding experiment
Analysis showed ONLY Peter''s experiment (4.1/4.2) actually affected survival,
but standard practice is to exclude ALL fed and neighbor birds from all
feeding experiments.';

COMMENT ON COLUMN survival.natal_year IS
'Calendar year the bird was born or first observed. Corresponds to natalyr2
in the original survival file.';


-- =============================================================================
-- 7. OFFSPRING IDENTITY DEFINITIONS
-- =============================================================================

COMMENT ON COLUMN breed.kid1 IS 'Band ID (ninecode) of first offspring from this nest attempt. Links to birds.band_id.';
COMMENT ON COLUMN breed.kid2 IS 'Band ID of second offspring. NULL if fewer than 2 young.';
COMMENT ON COLUMN breed.kid3 IS 'Band ID of third offspring. NULL if fewer than 3 young.';
COMMENT ON COLUMN breed.kid4 IS 'Band ID of fourth offspring. NULL if fewer than 4 young.';
COMMENT ON COLUMN breed.kid5 IS 'Band ID of fifth offspring. NULL if fewer than 5 young. Extremely rare — clutch sizes of 5 are almost never observed.';


-- =============================================================================
-- 8. NEST LOCATION DEFINITIONS
-- =============================================================================

COMMENT ON COLUMN breed.utm_x IS 'UTM X coordinate (Easting) of nest location. More recent, GPS-derived.';
COMMENT ON COLUMN breed.utm_y IS 'UTM Y coordinate (Northing) of nest location. More recent, GPS-derived.';
COMMENT ON COLUMN breed.orig_x IS 'Original X coordinate from pre-GPS era. CAUTION: these data were not comprehensively proofed — avoid fine-scale spatial inference without verifying against original cards.';
COMMENT ON COLUMN breed.orig_y IS 'Original Y coordinate from pre-GPS era. Same caution as orig_x.';
