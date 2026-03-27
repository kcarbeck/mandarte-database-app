# Mandarte Island Song Sparrow Study — Database Specification

**Version:** 1.0
**Date:** March 27, 2026
**Author:** Katherine Carbeck, with Claude
**Status:** Draft

---

## 1. Overview

This document specifies the relational database that will serve as the central data infrastructure for the Mandarte Island Song Sparrow long-term population study (1975–present). The database replaces the current Excel-based breedfile and survival file system while preserving full backward compatibility.

### 1.1 Design Principles

1. **Raw data is sacred.** Original data is never overwritten or deleted. All corrections are tracked as new records with full audit trails. The raw archive layer is append-only.
2. **Familiar naming.** Working tables mirror the names scientists already know: `survival` (the survival file), `breed` (the breedfile).
3. **Minimum viable tables.** Five working tables, no more than needed. Additional structure comes from lookup tables and the archive layer.
4. **Non-coder friendly.** Scientists interact through a web UI with inline documentation, dropdown pickers for coded fields, and validation that prevents bad data from entering. SQL knowledge is never required.
5. **Field app integration.** The database is designed to receive structured data from the Mandarte Field Data Collection App, which captures territory visits and nest observations in real time.
6. **PostgreSQL via Supabase.** Hosted PostgreSQL for multi-user access, built-in authentication, and automatic API generation. Supabase free tier (500MB) is more than sufficient for Mandarte's data volume (~5MB). Provides a web dashboard for visual table browsing and user management without command-line knowledge.

### 1.2 Architecture: Two-Layer Design

**Layer 1 — Immutable Archive**
Exact mirrors of the original Excel data, row for row. Once a row is written, it is never modified or deleted. Corrections are handled through a separate corrections table.

- `raw_survival` — original survival file rows
- `raw_breed` — original breedfile rows
- `corrections` — audit trail of every change

**Layer 2 — Working Tables**
The "current best" version of the data. Built from Layer 1 with corrections applied. Scientists interact with this layer. The field app writes to this layer (via the territory_visits and nest_visits tables).

- `birds` — master roster of individuals
- `survival` — one row per bird per year alive
- `breed` — one row per nest attempt
- `territory_visits` — field visit log (from app)
- `nest_visits` — nest observation log (from app)

**Lookup Tables**
Small reference tables that define valid codes and power UI dropdowns:

- `lookup_failcode`
- `lookup_stagfind`
- `lookup_experiment`
- `lookup_sex`
- `lookup_eggslaid`
- `lookup_wholeclutch`
- `lookup_filenote`

---

## 2. Working Tables — Complete Column Definitions

### 2.1 `birds` — Master Bird Roster

One row per individual bird ever identified on Mandarte. Populated from both the survival file (all ninecodes) and the breedfile (all kid1–kid5 band numbers, including birds that did not survive to appear in the survival file).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| band_id | INTEGER | PRIMARY KEY | 9-digit metal band number (ninecode). The unique identifier for every bird. |
| sex | INTEGER | | 0 = unknown (juvenile), 1 = female, 2 = male. May be updated from 0 to 1 or 2 when sex is determined. |
| is_immigrant | INTEGER | NOT NULL, DEFAULT 0 | 1 = immigrant (not hatched on island), 0 = resident-hatched. |
| natal_year | INTEGER | | Calendar year hatched or first observed (from natalyr2 in survival file, or inferred from first breedfile appearance as a kid). NULL if unknown. |
| notes | TEXT | | Any notes about this individual (e.g., "fledged unbanded, later identified by genetics"). |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When this record was created. |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When this record was last updated. |

**Fake band numbers:** Some birds were never banded or needed distinguishing placeholder IDs. Known fake band numbers (from Pirmin Nietlisbach's change log) include 111111111–111111116, 999666001–999666003, 999999030, 999999038, 999999464, 999999995, 999999999. These are valid entries in the birds table but should be flagged in the UI.

### 2.2 `survival` — Bird-Year Records

One row per bird per year it was alive. Mirrors the structure of the survival file. A bird alive for 4 years has 4 rows.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| survival_id | INTEGER | PRIMARY KEY GENERATED ALWAYS AS IDENTITY | Auto-generated unique row ID. |
| band_id | INTEGER | NOT NULL, FOREIGN KEY → birds.band_id | 9-digit band number. |
| study_year | INTEGER | NOT NULL | Study-year index (1 = 1975, 2 = 1976, etc.). From `year1` in original file. |
| year | INTEGER | NOT NULL | Calendar year (1975–present). From `year2` in original file. |
| age | INTEGER | NOT NULL | Age in years. 0 = independent juvenile (seen at/after day 24). 1+ = adult age. Immigrants are assumed age 1 in first year. |
| sex | INTEGER | NOT NULL | 0 = unknown (all age-0 birds, even if sex is later determined), 1 = female, 2 = male. |
| survived | INTEGER | NOT NULL | 1 = survived to next year, 0 = did not. |
| censored | INTEGER | NOT NULL, DEFAULT 0 | 1 = censor this bird in survival analyses (killed by humans or experiments). |
| is_immigrant | INTEGER | NOT NULL, DEFAULT 0 | 1 = immigrant, 0 = resident-hatched. |
| experiment | TEXT | DEFAULT '0' | Experiment code. '0' = no experiment. See lookup_experiment for full list. |
| natal_year | INTEGER | | Calendar year of birth/first appearance. From `natalyr2` in original file. |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When this record was ingested. |

**Unique constraint:** (band_id, year) — a bird can only have one record per year.

**Inclusion rules (from Amy Marr's documentation):**
- A bird is included for a year if it was seen with ≥2 independent sightings (or one very confident sighting: caught in net, bands verified, mapped by skilled observer) after April 1 of that year.
- Juveniles get a row at age 0 if their band combo was seen at or after day 24. Immigrants do NOT get age-0 rows.
- Immigrant age is assumed to be 1 in their first year on the island.
- Sex = 0 for all age-0 birds, even if sex is later determined.
- Floater males, unmated males, and non-breeding females are included.

### 2.3 `breed` — Nest Attempt Records

One row per nest attempt. Mirrors the structure of the breedfile. Also includes rows for unmated males with territories (nestrec = NULL, most columns empty).

#### Identification & Timing

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| nestrec | INTEGER | UNIQUE (when not NULL) | Unique nest-attempt ID (consecutive integers). NULL for unmated male territory-holder entries. |
| year | INTEGER | NOT NULL | Calendar year (1975–present). From `Year` in original file. |
| study_year | INTEGER | | Study-year index (1 = 1975). From `year` in original file. |
| territory | TEXT | | Territory code. Can be numeric or alphanumeric (e.g., "22A", "13/14"). TEXT type to accommodate all formats. |
| brood | INTEGER | | Successful brood sequence number for pair/territory in the season. |

#### Parents

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| male_id | INTEGER | FOREIGN KEY → birds.band_id | 9-digit band ID of social father. |
| female_id | INTEGER | FOREIGN KEY → birds.band_id | 9-digit band ID of social mother. NULL for unmated male entries. |
| male_age | TEXT | | Age of male in years. '.' if unknown (especially pre-1980). TEXT because original data contains non-numeric values. |
| male_attempt | TEXT | | Male's attempt number within the season for this individual. |
| female_age | TEXT | | Age of female in years. '.' if unknown. |
| female_attempt | TEXT | | Female's attempt number within the season. |

**Note on parental identity:** Attempt number refers to the individual parent, not the pair. Male and female attempt numbers differ when mate-switching occurs. Paternity is assigned to the presumed father at egg-laying, not to takeover males. Takeovers and adoptions are noted in othernotes.

#### Nest Location

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| utm_x | REAL | | UTM X coordinate of nest location. **Missing for all records 2020–2024.** |
| utm_y | REAL | | UTM Y coordinate of nest location. **Missing for all records 2020–2024.** |
| orig_x | REAL | | Original x-y grid coordinate. Not comprehensively proofed; avoid fine-scale spatial inference without card verification. |
| orig_y | REAL | | Original y grid coordinate. |

#### Date of First Egg (DFE)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| corr_dfe | INTEGER | | Corrected date of first egg (Julian day of year). From 2014 review by Ryan Germain/Corey. **Preferred for analyses when present.** Missing for most records 2022–2024. |
| dfe | INTEGER | | Original date of first egg (Julian day of year). Pre-1990s: only entered when directly observed. Post-1990s: inferred within ±3.5 days. |
| dfe_quality | TEXT | | Uncertainty flag for DFE. Valid values: '.', '?', '+', '-'. |
| orig_dfe | INTEGER | | Pre-harmonization DFE. **Do not use for analysis** — retained only to understand why prior analyses may have differed slightly. |

**DFE calculation (from protocol):** DFE = date of hatch − 13 days incubation − (clutch size − 1) days for laying (one egg per day). Adjust for cowbird eggs. Day-6 banding age is the most reliable anchor for back-calculating hatch date.

**Recommendation:** For analyses, prefer `corr_dfe` when present; otherwise use `dfe`. If both exist and differ materially, inspect the original nest cards.

#### Reproductive Counts (Host Sparrow)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| eggs | INTEGER | | Number of song sparrow eggs. |
| eggs_quality | TEXT | | Uncertainty flag. Historical values: '.', '?', '+', '-', '?+', '?+++', '?-'. Also contains '2', '3', '4' (likely data entry errors — values that belong in the eggs column). |
| hatch | INTEGER | | Number of young hatched. |
| hatch_quality | TEXT | | Uncertainty flag. Historical values: '.', '?', '+', '-'. Also contains '0', '2', '3', '4' (likely data entry errors). |
| band | INTEGER | | Number of young reaching banding age (~day 6). |
| band_quality | TEXT | | Uncertainty flag. Historical values: '.', '?', '+'. |
| fledge | INTEGER | | Number of young fledged (day 12–14 check). |
| fledge_quality | TEXT | | Uncertainty flag. Historical values: '.', '?', '+', '-', '?+'. Also contains '2', '3' (likely data entry errors). |
| indep | INTEGER | | Number of young reaching independence (day 22–24+). |
| indep_quality | TEXT | | Uncertainty flag. Historical values: '.', '?', '+', '-', '?+'. Also contains '2' (likely data entry error). |

**Backfilling logic (from Amy Marr):** If `indep` is a number and `fledge` is unknown, then `fledge` = `indep`. If `fledge` is a number and `band` is unknown, then `band` = `fledge`. And so on backward through the pipeline. Use `stage_find` to limit bias from late-found nests.

**Quality column history:** The `q` columns were introduced by Amy Marr because different observers across 50 years had different tolerances for what counted as a confirmed count. For example, if a nest was first visited with 4 chicks, clutch size was assumed to be 4 (5-egg clutches are very rare), but for some analyses only directly observed clutch sizes were desired. The `q` flag lets analysts decide how strict to be. These columns were never used consistently and are not required for new data entry going forward.

#### Brown-Headed Cowbird Parasitism

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| cow_egg | INTEGER | | Number of cowbird eggs. |
| cow_hatch | INTEGER | | Number of cowbird young hatched. |
| cow_band | TEXT | | Cowbird banding info. TEXT because original data contains mixed types. |
| cow_fledge | TEXT | | Cowbird fledging info. TEXT because original data contains mixed types. |

#### Offspring Identity

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| kid1 | INTEGER | FOREIGN KEY → birds.band_id | Band ID of first offspring. |
| kid2 | INTEGER | FOREIGN KEY → birds.band_id | Band ID of second offspring. |
| kid3 | INTEGER | FOREIGN KEY → birds.band_id | Band ID of third offspring. |
| kid4 | INTEGER | FOREIGN KEY → birds.band_id | Band ID of fourth offspring. |
| kid5 | INTEGER | FOREIGN KEY → birds.band_id | Band ID of fifth offspring. |

**Note:** 5 kid columns is sufficient. In 50 years of data (3,645 nest records), only 5 nests ever used all 5 kid slots. Some fledglings were unbanded yet later recruited; genetics and card notes in the 2010s linked a few such cases.

#### Nest Outcome

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| stage_find | TEXT | | Stage at first discovery. See `lookup_stagfind` for valid codes. Most common is IC (incubating). |
| recruits | INTEGER | | Number of young from this attempt that later recruited to the breeding population. Mostly '.' post-2003 because recruitment is tracked primarily in the survival file. |
| eggs_laid | TEXT | | Were eggs laid in this nest? Valid values: 'Y' (yes), 'N' (no), 'U' (unknown). |
| whole_clutch | TEXT | | Was the entire clutch observed (bird seen incubating)? 'Y' = yes (bird seen incubating), 'N' = no or can't be certain. **Missing for all records 2022–2024.** |
| stage_fail | TEXT | | Stage at failure (if nest failed). **Missing for all records 2020–2024.** Historical values include numeric codes and text codes (NB, EL, IC, HY, B, I). |
| fail_code | TEXT | | Coded cause of nest failure. See `lookup_failcode` for valid codes (1–24; 24 = success). **Missing for all records 2020–2024.** TEXT type because historical data contains non-standard entries ('5,6', 'ENTE', '0') that are preserved. |
| broke_egg | TEXT | | Broken egg count or indicator. |
| experiment | TEXT | | Experiment code. See `lookup_experiment`. **Critical: exclude feeding experiments (codes 3, 4.1, 4.2, 6) from most analyses.** |
| file_note | TEXT | | 'PB' = partly built nest. Nests marked PB should NOT be counted as attempts in cumulative counts (only entered in some years). |

#### Notes (Free Text)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| fail_notes | TEXT | | Free-text elaboration on nest failure. |
| other_notes | TEXT | | Free-text notes about the nest attempt. Includes information about takeovers, adoptions, unusual circumstances. |
| unhatch | TEXT | | Free-text/count of unhatched eggs (e.g., "fertilized d7", "1 unfertilized"). |
| question_mark_plus_minus | TEXT | | Legacy storage of '?', '+', '-' flags from the original special-character column. Historical artifact; purpose not fully understood. |

#### Metadata

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When this record was created. |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When this record was last updated. |

### 2.4 `territory_visits` — Field Visit Log

One row per visit to a territory. Populated by the field data collection app (no historical data — this table begins with the app's launch). Digital equivalent of entries on paper territory cards.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| visit_id | INTEGER | PRIMARY KEY GENERATED ALWAYS AS IDENTITY | Auto-generated unique ID. |
| territory | TEXT | NOT NULL | Territory code (matches breed.territory). |
| year | INTEGER | NOT NULL | Calendar year. |
| visit_date | TEXT | NOT NULL | Date of visit (ISO 8601: YYYY-MM-DD). |
| visit_time | TEXT | | Time of visit (HH:MM). |
| observer | TEXT | NOT NULL | Name or ID of the field observer. |
| male_seen | INTEGER | | 1 = male observed, 0 = not observed. |
| male_band_id | INTEGER | FOREIGN KEY → birds.band_id | Band ID of male observed (confirms identity). |
| female_seen | INTEGER | | 1 = female observed, 0 = not observed. |
| female_band_id | INTEGER | FOREIGN KEY → birds.band_id | Band ID of female observed. |
| minutes_spent | INTEGER | | Estimated time spent on territory (minutes). Free estimate, not a timer — students sometimes monitor adjacent territories simultaneously. |
| other_birds | TEXT | | Band IDs of other birds seen on territory (comma-separated or JSON). |
| nest_status_flag | TEXT | | 'no_change', 'new_nest_found', 'existing_nest_checked'. Links to nest_visits if applicable. |
| notes | TEXT | NOT NULL | Free-text observations. Must be substantive enough to demonstrate the student was physically present. Behavioral observations, locations within territory, other birds seen. |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When this record was created. |

### 2.5 `nest_visits` — Nest Observation Log

One row per visit to a nest. Populated by the field data collection app. Digital equivalent of the visit log rows on paper nest cards. Each nest (identified by nestrec in the breed table) may have many visit records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| nest_visit_id | INTEGER | PRIMARY KEY GENERATED ALWAYS AS IDENTITY | Auto-generated unique ID. |
| nestrec | INTEGER | FOREIGN KEY → breed.nestrec | Links to the parent nest attempt. |
| visit_date | TEXT | NOT NULL | Date of visit (ISO 8601: YYYY-MM-DD). |
| visit_time | TEXT | | Time of visit (HH:MM). |
| observer | TEXT | NOT NULL | Name or ID of the field observer. |
| nest_stage | TEXT | | Current stage: 'building', 'laying', 'incubating', 'nestling_D1' through 'nestling_D14', 'fledged', 'independent', 'failed', 'abandoned'. |
| egg_count | INTEGER | | Number of eggs observed. |
| chick_count | INTEGER | | Number of chicks observed. |
| chick_age_estimate | INTEGER | | Estimated chick age in days (if applicable). |
| cowbird_eggs | INTEGER | | Number of cowbird eggs observed. |
| cowbird_chicks | INTEGER | | Number of cowbird chicks observed. |
| band_combos_seen | TEXT | | Band combos of individual chicks seen (comma-separated or JSON). For fledge/independence checks. |
| contents_description | TEXT | | Free-text description of nest contents. |
| comments | TEXT | | Free-text comments about the visit. |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When this record was created. |

---

## 3. Lookup Tables

These small reference tables define the valid codes for each coded field. They power dropdown pickers in the UI and enforce data integrity. Each includes a human-readable description that serves as inline documentation for data entry.

### 3.1 `lookup_failcode`

| code | description | category |
|------|-------------|----------|
| 1 | Mouse droppings | Predation sign |
| 2 | Shell remains or yolk evidence | Predation sign |
| 3 | Egg punctured but not eaten, kicked egg outside nest | Predation sign |
| 4 | Lining disturbed or pulled | Predation sign |
| 5 | Nest tilted | Predation sign |
| 6 | Nest overturned / demolished / gone | Predation sign |
| 7 | Vegetation parted or trampled | Predation sign |
| 8 | Female died | Mortality |
| 9 | Abandoned, all eggs present | Abandonment |
| 10 | Abandoned, egg loss | Abandonment |
| 11 | Sparrow eggs replaced with cowbird eggs, nest abandoned | Cowbird parasitism |
| 12 | Empty intact, no signs of disturbance | Unknown cause |
| 13 | Mouse droppings + egg shells | Predation sign (combination) |
| 14 | Mouse droppings + lining disturbed | Predation sign (combination) |
| 15 | Egg shells + lining disturbed | Predation sign (combination) |
| 16 | Lining pulled + nest tilted | Predation sign (combination) |
| 17 | Lining pulled + vegetation parted | Predation sign (combination) |
| 18 | Young beaten / hole in head / broken legs, chick dead or alive outside nest before fledge age but not eaten | Predation sign |
| 19 | Young starved, intact but dead in nest | Starvation |
| 20 | Legs or wings of nestlings found in or near nest | Predation sign |
| 21 | Eggs remain but hatched young gone, no signs | Unknown cause |
| 22 | Human accident / experiment | Human cause |
| 23 | Other | Other |
| 24 | **Success** | Success |

**Historical anomalies in raw data:** fail_code '0' (likely = no code assigned / missing), '5,6' (two failure signs entered in one cell), 'ENTE' (apparent typo). These are preserved in the raw archive. In the working layer, they are kept as-is but flagged for review.

### 3.2 `lookup_stagfind`

| code | description |
|------|-------------|
| NB | Nest building |
| EL | Egg laying |
| IC | Incubating (most common — ~69% of historical records) |
| HY | Hatched young (found with chicks) |
| FY | Fledged young |
| MTD | Found empty nest, shows signs it once had eggs |
| MTUK | Found empty nest, nest either never used or already failed after use |
| EAF | Eggs or shells present in nest but nest found after fail |
| NFN | Never found nest |
| UK | Unknown (observations too confusing to assign stage) |

**Historical anomalies in raw data:** AF (1 record), B (1 record), EG (5 records), NY (1 record). Per project documentation, these are likely data entry errors. They are preserved in the raw archive and flagged for review in the working layer.

### 3.3 `lookup_experiment`

| code | description | year(s) | exclude_from_analysis |
|------|-------------|---------|----------------------|
| 0 | No experiment | — | No |
| 1 | Brood swap | 1975 | Depends on analysis |
| 2 | Mate removal | 1979 | Depends on analysis |
| 3 | Feeding experiment (at start of season or close neighbor with likely access) | 1979 | **YES — ALWAYS EXCLUDE** |
| 4.1 | Feeding experiment (neighbor) | 1985 | **YES — ALWAYS EXCLUDE** |
| 4.2 | Feeding experiment (fed bird) | 1985 | **YES — ALWAYS EXCLUDE** |
| 5 | Cross-foster | 1986 | Depends on analysis |
| 6 | Wes's feeding experiment (birds or close neighbor with likely access) | 1988 | **YES — ALWAYS EXCLUDE** |
| 7 | Rothstein egg experiment (uncertain if it affected nest success) | 1996 | Depends on analysis |
| 8 | Temperature probe experiment (3 nest attempts disrupted; female probably abandoned due to probe) | 1997–1998 | Depends on analysis |
| 9 | **UNDOCUMENTED — needs investigation. Code appears in breedfile data but no written documentation exists. Do not use in analyses until identified.** | Unknown | Unknown |

### 3.4 `lookup_sex`

| code | description |
|------|-------------|
| 0 | Unknown (all independent juveniles are coded 0, even if sex is later determined) |
| 1 | Female |
| 2 | Male |

### 3.5 `lookup_eggslaid`

| code | description |
|------|-------------|
| Y | Yes, eggs were laid |
| N | No eggs were laid |
| U | Unknown |

**Historical anomaly:** lowercase 'y' and '?' appear in raw data. Normalized to 'Y' and 'U' in working layer.

### 3.6 `lookup_wholeclutch`

| code | description |
|------|-------------|
| Y | Yes — bird was seen incubating the nest (confirming complete clutch) |
| N | No — bird was not seen incubating, or can't be certain clutch was complete |

**Historical anomaly:** lowercase 'y' and '?' appear in raw data. Normalized to 'Y' and 'N' (or flagged) in working layer.

### 3.7 `lookup_filenote`

| code | description |
|------|-------------|
| PB | Partly built nest. Should NOT be counted as an attempt in cumulative counts. Only entered in some years. |

---

## 4. Immutable Archive Layer

### 4.1 `raw_survival`

Exact mirror of each survival file row as ingested. Write-once, never modified.

| Column | Type | Description |
|--------|------|-------------|
| raw_id | INTEGER | PRIMARY KEY GENERATED ALWAYS AS IDENTITY |
| year1 | INTEGER | Original `year1` value (study year index) |
| year2 | INTEGER | Original `year2` value (calendar year) |
| age | INTEGER | Original `age` value |
| sex | INTEGER | Original `sex` value |
| surv | INTEGER | Original `surv` value |
| cens | INTEGER | Original `cens` value |
| is | INTEGER | Original `is` value |
| ninecode | INTEGER | Original `ninecode` value |
| expt | TEXT | Original `expt` value |
| natalyr2 | INTEGER | Original `natalyr2` value |
| ingested_at | TIMESTAMP | When this row was ingested |
| source_file | TEXT | Name of the source Excel file |
| source_sheet | TEXT | Sheet name within the file |
| source_row | INTEGER | Row number in the source file |

### 4.2 `raw_breed`

Exact mirror of each breedfile row as ingested. Write-once, never modified. Column names match the original Excel headers exactly.

| Column | Type | Description |
|--------|------|-------------|
| raw_id | INTEGER | PRIMARY KEY GENERATED ALWAYS AS IDENTITY |
| nestrec | TEXT | Original value (TEXT to preserve '.' for unmated males) |
| Year | INTEGER | Original `Year` value |
| year | INTEGER | Original `year` value (study year index) |
| terr | TEXT | Original `terr` value |
| male | TEXT | Original `male` value |
| maleage | TEXT | Original `maleage` value |
| maleatt | TEXT | Original `maleatt` value |
| female | TEXT | Original `female` value |
| femage | TEXT | Original `femage` value |
| fematt | TEXT | Original `fematt` value |
| brood | TEXT | Original `brood` value |
| UTM_Nest_X | TEXT | Original value |
| UTM_Nest_Y | TEXT | Original value |
| orig_Nest_X | TEXT | Original value |
| orig_Nest_Y | TEXT | Original value |
| corrDFE | TEXT | Original value |
| dfe | TEXT | Original value |
| dfeq | TEXT | Original value |
| eggs | TEXT | Original value |
| eggsq | TEXT | Original value |
| cowegg | TEXT | Original value |
| hatch | TEXT | Original value |
| hatchq | TEXT | Original value |
| cowhatch | TEXT | Original value |
| band | TEXT | Original value |
| bandq | TEXT | Original value |
| cowband | TEXT | Original value |
| fledge | TEXT | Original value |
| fledgeq | TEXT | Original value |
| cowfled | TEXT | Original value |
| indep | TEXT | Original value |
| indepq | TEXT | Original value |
| kid1 | TEXT | Original value |
| kid2 | TEXT | Original value |
| kid3 | TEXT | Original value |
| kid4 | TEXT | Original value |
| kid5 | TEXT | Original value |
| stagfind | TEXT | Original value |
| recruits | TEXT | Original value |
| origdfe | TEXT | Original value |
| filenote | TEXT | Original value |
| eggslaid | TEXT | Original value |
| wholeclutch | TEXT | Original value |
| stagfail | TEXT | Original value |
| failcode | TEXT | Original value |
| brokegg | TEXT | Original value |
| expt | TEXT | Original value |
| failenotes | TEXT | Original value |
| othernotes | TEXT | Original value |
| Unhatch | TEXT | Original value |
| QuestionmarkPlusMinus | TEXT | Original value |
| ingested_at | TIMESTAMP | When this row was ingested |
| source_file | TEXT | Name of the source Excel file |
| source_sheet | TEXT | Sheet name within the file |
| source_row | INTEGER | Row number in the source file |

**Note:** All columns in raw tables are TEXT to preserve original values exactly, including '.', blanks, mixed case, and any other formatting. No type coercion occurs at the archive layer.

### 4.3 `corrections`

Every change made to working-layer data is logged here. This is the audit trail that allows reconstruction of any value's history.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| correction_id | INTEGER | PRIMARY KEY GENERATED ALWAYS AS IDENTITY | Auto-generated unique ID. |
| table_name | TEXT | NOT NULL | Which working table was corrected ('birds', 'survival', 'breed'). |
| record_id | TEXT | NOT NULL | Identifier of the corrected record (band_id, survival_id, or nestrec). |
| column_name | TEXT | NOT NULL | Which column was changed. |
| old_value | TEXT | | Previous value (as string). |
| new_value | TEXT | | New value (as string). |
| reason | TEXT | NOT NULL | Why the correction was made. Required — every change must be justified. |
| corrected_by | TEXT | NOT NULL | Username of the admin who made the correction. |
| corrected_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When the correction was made. |
| approved_by | TEXT | | Optional second sign-off for critical corrections. |

---

## 5. Validation Rules

These rules are enforced by the database and/or the application layer. They prevent bad data from entering and catch errors at the point of entry rather than months later during post-season proofing.

### 5.1 Referential Integrity

| Rule | Description |
|------|-------------|
| Bird existence | `survival.band_id` must exist in `birds.band_id`. |
| Parent existence | `breed.male_id` and `breed.female_id` must exist in `birds.band_id` (when not NULL). |
| Offspring existence | `breed.kid1` through `breed.kid5` must exist in `birds.band_id` (when not NULL). |
| Nest visit linkage | `nest_visits.nestrec` must exist in `breed.nestrec`. |
| Territory visit bird linkage | `territory_visits.male_band_id` and `territory_visits.female_band_id` must exist in `birds.band_id` (when not NULL). |

### 5.2 Uniqueness

| Rule | Description |
|------|-------------|
| Band ID uniqueness | `birds.band_id` is unique (primary key). No duplicate birds. |
| Bird-year uniqueness | (band_id, year) is unique in `survival`. A bird has at most one record per year. |
| Nest record uniqueness | `breed.nestrec` is unique when not NULL. |
| Duplicate nest prevention | Same male_id + female_id + year + brood combination cannot appear twice in `breed`. |

### 5.3 Logical Consistency

| Rule | Description |
|------|-------------|
| Reproductive pipeline | eggs ≥ hatch ≥ band ≥ fledge ≥ indep (when all are non-NULL). You cannot fledge more birds than hatched. Violations are flagged as warnings (not hard blocks) to accommodate historical data anomalies. |
| Sex consistency | If a band_id appears as `male_id` in breed, that bird's sex in `birds` should be 2 (male). If it appears as `female_id`, sex should be 1 (female). Violations generate a warning. |
| Year range | year must be between 1975 and current year (inclusive). |
| Age range | age must be between 0 and 15 (max observed is 10, but allowing headroom). |
| DFE range | dfe and corr_dfe must be between 90 and 210 (roughly April 1 to July 29) when not NULL. |
| Survival binary | survived must be 0 or 1. |
| Censored binary | censored must be 0 or 1. |
| Immigrant binary | is_immigrant must be 0 or 1. |

### 5.4 Coded Field Enforcement

| Rule | Description |
|------|-------------|
| fail_code values | New entries must use codes from `lookup_failcode` (1–24). Historical non-standard values ('0', '5,6', 'ENTE') are preserved in existing data but cannot be entered for new records. |
| stage_find values | New entries must use codes from `lookup_stagfind` (NB, EL, IC, HY, FY, MTD, MTUK, EAF, NFN, UK). Historical anomalies (AF, B, EG, NY) are preserved but cannot be entered for new records. |
| experiment values | Must match codes in `lookup_experiment` (0, 1, 2, 3, 4.1, 4.2, 5, 6, 7, 8, 9). |
| sex values | Must be 0, 1, or 2 per `lookup_sex`. |
| eggs_laid values | Must be 'Y', 'N', or 'U' per `lookup_eggslaid`. |
| whole_clutch values | Must be 'Y' or 'N' per `lookup_wholeclutch`. |

---

## 6. Field App Integration

### 6.1 Data Flow

The Mandarte Field Data Collection App captures territory visits and nest observations in real time. Data flows into the database as follows:

```
Field App (student phones)
    │
    ├── Territory visits → territory_visits table
    │
    ├── Nest visit logs → nest_visits table
    │
    └── End-of-season summary → breed table
            (eggs, hatch, band, fledge, indep,
             kid IDs, DFE, failcode, etc.)
```

### 6.2 Mapping: App CSV Exports → Database Tables

The field app PRD (v1.0, March 20, 2026) defines five CSV export types. Here is how each maps to the database:

| App CSV Export | Database Table | Notes |
|---------------|---------------|-------|
| Territory visits (one row per visit) | `territory_visits` | Direct mapping. |
| Nest cards — header data (one row per nest) | `breed` | Summary fields populate the breed table. The app auto-calculates DFE from hatch date and clutch size. |
| Nest cards — visit log (one row per nest visit) | `nest_visits` | Direct mapping. |
| Individual chick records (one row per chick per check) | `nest_visits.band_combos_seen` | Chick sighting data is captured within nest visit records. Individual chick tracking is detailed enough for fledge/independence verification. |
| Tasks (one row per task) | Not stored in database | Task management is app-internal. Not part of the scientific data record. |

### 6.3 From App to Breed Table

At end of season, the nest card header data from the app populates new rows in the `breed` table. The app's summary fields map as follows:

| App Nest Card Field | Breed Column |
|---------------------|-------------|
| Territory | territory |
| Male metal band | male_id |
| Female metal band | female_id |
| Male attempt number | male_attempt |
| Female attempt number | female_attempt |
| Stage of find | stage_find |
| Clutch size (CS) | eggs |
| Date of first egg (DFE) | dfe (and/or corr_dfe) |
| Date of hatch (DH) | Not stored directly; used to calculate DFE |
| # Hatched | hatch |
| # Banded | band |
| # Fledged | fledge |
| # Independent | indep |
| # Unhatched eggs | unhatch |
| # Cowbird eggs | cow_egg |
| Failure cause | fail_code |
| Juvenile band combos | kid1–kid5 |

### 6.4 From App to Survival Table

At end of season, the survival table for the completed year is populated from a combination of:
- Birds observed during the season (from territory visits and nest records)
- Prior year's survival data (to determine who returned vs. who did not)
- Immigration events recorded during the season

This is a supervisory task, not automatic. The database provides tools to draft the year's survival records from app data, but a human (Katherine or designated admin) reviews and approves before they are committed.

---

## 7. User Roles and Access Control

| Role | Can read | Can enter new data | Can correct existing data | Can access raw archive |
|------|----------|-------------------|--------------------------|----------------------|
| Collaborator (read-only) | All working tables | No | No | Yes (read-only) |
| Field student | All working tables | territory_visits, nest_visits | No | No |
| Admin | All tables | All tables | Yes (logged in corrections table) | Yes (read-only) |

Admins are designated by Katherine. Corrections require a reason field and are permanently logged. The raw archive tables cannot be modified by any role through the application interface.

---

## 8. Technical Notes

### 8.1 PostgreSQL via Supabase

- **Platform:** Supabase (https://supabase.com) — hosted PostgreSQL with built-in dashboard, API, and authentication
- **Tier:** Free tier (500MB database, unlimited API requests, 50K monthly active users) — more than sufficient for Mandarte's data volume (~5MB)
- **Paid tier:** $25/month (Pro) if needed later — removes inactivity pause, adds backups and more storage
- **Free tier limitation:** Database pauses after 1 week of inactivity. Unpause with one click. Not an issue during field season (daily use). During off-season, occasional access keeps it active.
- **Dashboard:** Visual web interface for browsing tables, running queries, managing users — no command-line knowledge required
- **API:** Supabase auto-generates a REST API from the database schema. The field app communicates through this API.
- **Authentication:** Built-in user accounts with role-based access (admin, field student, read-only collaborator)
- **R compatibility:** Connect from R via `RPostgres` / `DBI` packages using the Supabase connection string. Or export to CSV/Excel for traditional R workflows.
- **Backups:** Supabase handles automatic backups on paid tier. On free tier, manual backups via `pg_dump` or Supabase dashboard export.

### 8.2 Local Development

For development and testing, use a local PostgreSQL instance or Docker container. The schema is identical — develop locally, deploy to Supabase when ready. No data is moved to Supabase until the schema is fully tested and validated.

### 8.3 Missing Value Convention

- In the original Excel files, missing values are represented by '.' (R-compatibility convention adopted in 2015).
- In the database working layer, missing values are NULL (standard SQL).
- In the raw archive layer, '.' is preserved as-is (TEXT columns).
- The web UI displays NULL as an empty field. CSV exports can be configured to output '.' for R compatibility.

### 8.4 Known Data Quality Issues

These are documented for awareness and should be addressed as a separate data remediation effort:

1. **Files not proofed since 2019.** Years 2020–2024 have systematic gaps: no UTM coordinates, no stagfail/failcode, no wholeclutch (2022–2024), some missing corrDFE/dfe.
2. **Survival file is one year behind** (ends 2023; breedfile goes to 2024).
3. **2025 field season data** is under review due to insufficient monitoring.
4. **Non-standard coded values** in historical data (see lookup tables for specifics).
5. **Quality columns** (eggsq, hatchq, etc.) used inconsistently across decades and observers.
6. **Experiment code 9** is undocumented. Appears in breedfile data but no written documentation exists. Needs investigation.
7. **Territory codes** are inconsistent types (numeric and string, e.g., "22A", "13/14"). Stored as TEXT to accommodate all formats.

---

## 9. Relationship Diagram

```
                    ┌──────────────────┐
                    │      birds       │
                    │  (master roster) │
                    │                  │
                    │  band_id (PK)    │
                    │  sex             │
                    │  is_immigrant    │
                    │  natal_year      │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
   ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐
   │   survival   │  │    breed    │  │ territory_visits  │
   │  (bird-year  │  │   (nest     │  │  (field app)      │
   │   records)   │  │  attempts)  │  │                   │
   │              │  │             │  │  male_band_id →   │
   │  band_id →   │  │ male_id →  │  │  female_band_id → │
   │  birds       │  │ female_id →│  └──────────────────┘
   └──────────────┘  │ kid1–5 →   │
                     │ birds      │
                     └──────┬─────┘
                            │
                            ▼
                     ┌─────────────┐
                     │ nest_visits  │
                     │ (field app)  │
                     │              │
                     │ nestrec →    │
                     │ breed        │
                     └─────────────┘

   Archive layer (read-only):
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ raw_survival │  │  raw_breed   │  │ corrections  │
   └──────────────┘  └──────────────┘  └──────────────┘

   Lookup tables:
   ┌────────────────┐ ┌──────────────┐ ┌─────────────────┐
   │lookup_failcode │ │lookup_stagfind│ │lookup_experiment│
   └────────────────┘ └──────────────┘ └─────────────────┘
   ┌────────────┐ ┌─────────────────┐ ┌───────────────────┐
   │ lookup_sex │ │lookup_eggslaid  │ │lookup_wholeclutch │
   └────────────┘ └─────────────────┘ └───────────────────┘
```

---

## Appendix A: Column Name Mapping (Excel → Database)

### Survival File → `survival` table

| Excel Column | Database Column | Notes |
|-------------|----------------|-------|
| year1 | study_year | |
| year2 | year | |
| age | age | |
| sex | sex | |
| surv | survived | Renamed for clarity |
| cens | censored | Renamed for clarity |
| is | is_immigrant | Renamed; 'is' is a reserved word in SQL |
| ninecode | band_id | Renamed to match birds table |
| expt | experiment | Renamed for clarity |
| natalyr2 | natal_year | Renamed for clarity |

### Breedfile → `breed` table

| Excel Column | Database Column | Notes |
|-------------|----------------|-------|
| nestrec | nestrec | |
| Year | year | |
| year | study_year | |
| terr | territory | Renamed for clarity |
| male | male_id | Renamed; FOREIGN KEY |
| female | female_id | Renamed; FOREIGN KEY |
| maleage | male_age | |
| maleatt | male_attempt | |
| femage | female_age | |
| fematt | female_attempt | |
| brood | brood | |
| UTM_Nest_X | utm_x | Shortened |
| UTM_Nest_Y | utm_y | Shortened |
| orig_Nest_X | orig_x | Shortened |
| orig_Nest_Y | orig_y | Shortened |
| corrDFE | corr_dfe | Snake_case |
| dfe | dfe | |
| dfeq | dfe_quality | Renamed for clarity |
| eggs | eggs | |
| eggsq | eggs_quality | Renamed for clarity |
| hatch | hatch | |
| hatchq | hatch_quality | Renamed for clarity |
| band | band | |
| bandq | band_quality | Renamed for clarity |
| fledge | fledge | |
| fledgeq | fledge_quality | Renamed for clarity |
| indep | indep | |
| indepq | indep_quality | Renamed for clarity |
| cowegg | cow_egg | Snake_case |
| cowhatch | cow_hatch | Snake_case |
| cowband | cow_band | Snake_case |
| cowfled | cow_fledge | Renamed for clarity |
| kid1–kid5 | kid1–kid5 | |
| stagfind | stage_find | Snake_case |
| recruits | recruits | |
| origdfe | orig_dfe | Snake_case |
| filenote | file_note | Snake_case |
| eggslaid | eggs_laid | Snake_case |
| wholeclutch | whole_clutch | Snake_case |
| stagfail | stage_fail | Snake_case |
| failcode | fail_code | Snake_case |
| brokegg | broke_egg | Snake_case |
| expt | experiment | Renamed for clarity |
| failenotes | fail_notes | Renamed |
| othernotes | other_notes | Snake_case |
| Unhatch | unhatch | Lowercase |
| QuestionmarkPlusMinus | question_mark_plus_minus | Snake_case |
