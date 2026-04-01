---
name: mandarte-domain-knowledge
description: >
  Comprehensive domain knowledge for the Mandarte Island Song Sparrow long-term population study.
  Use this skill whenever the user mentions Mandarte, song sparrows, fox sparrows,
  SOSP, FOSP, breedfile, survival file, territory cards, nest cards, band combos, banding, nestrec,
  DFE, DH, clutch size, fledge, independence, failcode, stagfind, or any field ecology / avian
  breeding terminology in the context of this project. Also trigger for any database schema design,
  field app development, data migration, protocol writing, or data quality work related to Mandarte.
  This skill is the authoritative source for project terminology, data structures, business rules,
  and architectural decisions — always consult it before making assumptions about how the Mandarte
  data or fieldwork works.
---

# Mandarte Island Song Sparrow Study — Domain Knowledge

## 1. Project Overview

The Mandarte Island Song Sparrow (SOSP) study is a **50-year individual-based population study** (1975–present, excluding 1980) tracking every breeding bird through each field season on Mandarte Island near Sidney, BC. Mandarte Island is located within the territory of the W̱SÁNEĆ peoples. A parallel Fox Sparrow (FOSP) study is being added. The project was founded by Peter Arcese at UBC and is now led by Jen Walsh at the Cornell Lab of Ornithology. Katherine is the researcher overseeing modernization: protocol update, field data collection app, and database migration.

**Key facts:**
- Every territorial male and breeding female on the island is individually banded and monitored
- Every nest attempt is documented from discovery through success or failure
- The population is small (recently ~25–30 birds) and fully enumerable
- Mandarte Island is W̱SÁNEĆ territory — the study operates with respect for the First Nations community and their land
- Two field students live on the island during the breeding season (April–July), with Katherine supervising remotely
- Paper records (territory cards, nest cards, band books, maps) remain the primary data source; the app supplements them for compliance monitoring and task scheduling

## 2. Core Terminology

### Abbreviations (used on cards, in data files, and in conversation)

| Abbrev | Meaning |
|--------|---------|
| SOSP | Song Sparrow (*Melospiza melodia*) |
| FOSP | Fox Sparrow (*Passerella iliaca*) |
| BHCO | Brown-headed Cowbird (brood parasite) |
| DFE | Date of first egg (Julian day) |
| DH | Date of hatch (Julian day) |
| CS | Clutch size (SOSP eggs only; cowbird eggs counted separately) |
| #H | Number hatched |
| #B | Number banded (reached banding age, ~day 6) |
| #F | Number fledged (day 12–14) |
| #I | Number independent (day 22–26+) |
| NI | Not incubating |
| NB | Nest building |
| IC | Incubating |
| B | Brooding |
| EL | Egg laying |
| HY | Hatched young (also: Hatch Year bird) |
| FY | Fledged young |
| AHY | After hatch year (adult) |
| DNF | Did not fledge |
| NOBA | Not banded |
| Ub | Unbanded |
| SP | Cloacal protuberance (indicates breeding male) |
| ID | Identification |

### Band Combo Notation

Birds are identified by color band combinations on their legs. Read order: **left top, left bottom . right top, right bottom** (from the bird's perspective).

**Color abbreviations:** m = metal, r = red, o = orange, y = yellow, g = green, b = (light) blue, db = dark blue, p = purple, w = white.

**Example:** `dbm.gr` = left leg: dark blue (top) + metal (bottom); right leg: green (top) + red (bottom).

The 9-digit metal band number (ninecode) is the permanent unique identifier for each bird. Color combos are visual field identifiers and may be reused after a bird dies.

### Stage-of-Find Codes (`stagfind`)

| Code | Meaning |
|------|---------|
| NB | Nest building |
| EL | Egg laying |
| IC | Incubating (most common: ~70% of nests) |
| HY | Hatched young |
| FY | Fledged young |
| MTD | Found empty nest, signs it once had eggs |
| MTUK | Found empty nest, unknown if ever used or already failed |
| EAF | Eggs/shells present but nest found after failure |
| NFN | Never found nest |
| UK | Unknown |

Note: A few non-standard values exist in historical data (EG, NY, B, AF) — these are entry errors.

### Failcodes (`failcode`)

| Code | Cause |
|------|-------|
| 1 | Mouse droppings |
| 2 | Shell remains / yolk evidence |
| 3 | Egg punctured but not eaten, egg kicked outside nest |
| 4 | Lining disturbed or pulled |
| 5 | Nest tilted |
| 6 | Nest overturned / demolished / gone |
| 7 | Vegetation parted or trampled |
| 8 | Female died |
| 9 | Abandoned, all eggs present |
| 10 | Abandoned, egg loss |
| 11 | SOSP eggs replaced with cowbird eggs, nest abandoned |
| 12 | Empty intact, no signs of disturbance |
| 13 | Mouse droppings + egg shells |
| 14 | Mouse droppings + lining disturbed |
| 15 | Egg shells + lining disturbed |
| 16 | Lining pulled + nest tilted |
| 17 | Lining pulled + vegetation parted |
| 18 | Young beaten / broken legs / hole in head; chick dead or alive outside nest before fledge age |
| 19 | Young starved, intact but dead in nest |
| 20 | Legs or wings of nestlings found in or near nest |
| 21 | Eggs remain but hatched young gone, no signs |
| 22 | Human accident / experiment |
| 23 | Other |
| **24** | **Success** |

### Experiment Codes (`expt`)

| Code | Experiment | Exclude from analyses? |
|------|-----------|----------------------|
| 1 | 1975 brood swap | No (but note) |
| 2 | 1979 mate removal | No (but note) |
| **3** | **1979 feeding experiment** | **YES — ALWAYS EXCLUDE** |
| **4.1** | **1985 feeding expt (neighbor)** | **YES — ALWAYS EXCLUDE** |
| **4.2** | **1985 feeding expt (fed bird)** | **YES — ALWAYS EXCLUDE** |
| 5 | 1986 cross-foster | No (but note) |
| **6** | **1988 Wes's feeding expt** | **YES — ALWAYS EXCLUDE** |
| 7 | 1996 Rothstein egg experiment | Maybe |
| 8 | 1997–98 temperature probe (3 nests) | Note |

## 3. Data Files

### 3.1 Breedfile

**File:** `COMBINED_19752024_MandarteBreedfile_16March2026.xlsx` (sheet: `breedfile`)
**Structure:** Each row = one nest attempt. 3,645 records, 1975–2024. Also includes rows for unmated males with territories (nestrec = `.`, only Year/terr/male/maleage populated).
**51 real columns** (17 trailing empty columns to ignore).

**Key columns:**
- `nestrec` — unique nest-attempt ID (consecutive integers). `.` for unmated male entries.
- `Year` — calendar year. `year` — study-year index (1 = 1975).
- `terr` — territory code. Can be numeric or alphanumeric (e.g., "22A", "13/14").
- `male`, `female` — 9-digit metal band IDs of social parents.
- `maleage`, `femage` — age in years. `maleatt`, `fematt` — attempt number within season for that individual.
- `brood` — successful brood sequence number.
- `UTM_Nest_X`, `UTM_Nest_Y` — UTM coordinates. **Missing for all 2020–2024 records.**
- `corrDFE` — corrected DFE (prefer this over `dfe` when present). `dfe` — original DFE. `dfeq` — uncertainty flag.
- `origdfe` — pre-harmonization DFE. **Do not use for analysis.**
- `eggs`, `hatch`, `band`, `fledge`, `indep` — reproductive stage counts.
- `eggsq`, `hatchq`, `bandq`, `fledgeq`, `indepq` — paired uncertainty flags (inconsistently used).
- `cowegg`, `cowhatch`, `cowband`, `cowfled` — cowbird counts at each stage.
- `kid1`–`kid5` — band IDs of individual offspring.
- `stagfind`, `stagfail`, `failcode` — see lookup tables above.
- `eggslaid` (Y/U/N), `wholeclutch` (Y/N — was bird seen incubating?).
- `brokegg` — broken egg count.
- `expt` — experiment code.
- `filenote` — `PB` = partly built, do NOT count as attempts.
- `recruits` — mostly `.` post-2003 (tracked in survival file instead).
- `failenotes`, `othernotes`, `Unhatch`, `QuestionmarkPlusMinus` — free text / legacy.

**Backfilling logic:** If `indep` is known and `fledge` is missing → `fledge = indep`. If `fledge` is known and `band` is missing → `band = fledge`. Use `stagfind` to limit bias from late-found nests.

**Missing values:** `.` (dot) throughout (R-compatibility convention since 2015).

**Additional sheets:** `Locations` (nest coords through 2012), `newDFE` (corrected DFEs through 2013).

### 3.2 Survival File

**File:** `19752023_survival_file.xlsx` (sheet: `Sheet 1`)
**Structure:** Each row = one bird in one year of its life. 7,791 records, 1975–2023. **One year behind the breedfile by design** — survival can only be confirmed the following spring.

**Columns:**
- `year1` — study-year index (1 = 1975). `year2` — calendar year.
- `ninecode` — 9-digit band ID (primary identifier).
- `age` — 0 = independent juvenile (seen at/after day 24); 1+ = adult age. Max observed = 10.
- `sex` — 0 = unknown (all age-0 birds), 1 = female, 2 = male.
- `surv` — survived to next year (1 = yes, 0 = no).
- `cens` — censor flag (1 = killed by humans/experiments; exclude from survival analyses).
- `is` — immigrant status (1 = immigrant, 0 = resident-hatched).
- `expt` — experiment code (same as breedfile).
- `natalyr2` — natal year (calendar year of birth/first appearance).

**Inclusion rules:**
- Bird must have ≥2 independent sightings (or 1 very confident: netted, bands verified, mapped by skilled observer) after April 1 of that year.
- Juveniles get an age-0 row only if their band combo was seen at or after day 24.
- **Immigrants do NOT get age-0 rows.** Immigrant age is assumed to be 1 in first year on island.
- Sex = 0 for all age-0 birds, even if sex is later determined.
- Floaters, unmated males, and non-breeding females are included.

**Ages in the survival file are more reliable than ages in the breedfile.**

### 3.3 Relationship Between Files

- The breedfile tracks nest attempts; the survival file tracks individual birds across years.
- `kid1`–`kid5` in the breedfile link to `ninecode` in the survival file.
- `male`/`female` in the breedfile link to `ninecode` in the survival file.
- More independent young may appear in the breedfile than the survival file (breedfile counts observations; survival file requires confirmed sightings with bands verified).
- `recruits` in the breedfile is mostly `.` post-2003 because recruitment is tracked via the survival file.

## 4. Fieldwork Protocol — Key Rules

### DFE Calculation
- Back-calculated: DFE = DH − 13 − (CS − 1). One egg laid per day, 13-day incubation.
- Adjust for cowbird eggs if clutch was parasitized.
- Acceptable uncertainty: ±3.5 days.
- Day-6 banding age is the most reliable anchor for back-calculating hatch date.
- Leap years must be accounted for in Julian day calculations.
- Pre-1990s: DFE only entered when directly observed. Post-1990s: inferred from stage transitions.

### Critical Timing Windows
- **Banding:** Target day 6. Day 3 acceptable in emergencies (1 band per leg only). Day 7 acceptable but chicks may jump.
- **DO NOT APPROACH day 9–11:** Chicks jump prematurely with high mortality.
- **Fledge check:** Day 12–14. Record what you see; do not guess earlier-banded chicks survived.
- **Independence check:** Day 22–24+. Sightings after day 22 count. Revise count upward if more juveniles seen later.

### Visit Frequencies
- Territory with active nest or female present: every 3–5 days (max 7).
- Single male, no suspected female: every 6 days.
- Single male, female suspected: every 5 days.
- After nest failure: revisit for re-nest every 4 days; intensify to every 2 days if 20+ days pass with no re-nest.

### Data Recording Rules
- `.` (dot) = genuine uncertainty ("you really don't know").
- `0` = you believe the data point is actually zero.
- `#B` = number reaching banding age (day 6), NOT number physically banded.
- `#F` and `#I` should NOT be finalized immediately — can be revised upward with later sightings.
- Attempt number refers to the *individual parent*, not the pair. Male and female attempt numbers can differ.
- Paternity assigned to the presumed father at egg-laying, not to takeover males.

### Nest Finding
- 90–95% of nests on Mandarte should be found during incubation.
- Nest building takes ~3 days (up to a week in rain).
- Copulation usually indicates egg-laying is occurring.
- After failure, birds renest almost immediately during peak season. Second nests are often higher in vegetation.

## 5. Data Quality Warnings

- **Files not proofed since 2019.** 2020–2024 breedfile data has systematic gaps: no UTM coords, no stagfail/failcode, no wholeclutch (2022–2024), some missing corrDFE/dfe.
- **2025 field season was poorly executed.** Territories not visited frequently enough, nests missed, fledge/independence checks unreliable. Data under review.
- The `q` (uncertainty) columns were used inconsistently across decades and observers.
- Territory codes are mixed types (numeric and string: "22A", "13/14").
- The breedfile has 17 trailing empty columns.
- Some non-standard `stagfind` values exist (EG, NY, B, AF) — entry errors.
- Nest coordinate data (`orig_Nest_X/Y`) were never comprehensively proofed.

## 6. Architectural Decisions

### Database Architecture: Option C (Staging + Release)

The preferred architecture for handling incoming field season data alongside the historical dataset uses structurally separate working tables:

- **Historical tables** (`breed`, `survival`) contain proofed, released data. The field app **cannot write directly** to these tables.
- **Staging tables** hold current-season data from the field app. Data lives here until end-of-season proofing is complete.
- **Release process:** After proofing, staging data is flattened (e.g., per-nest visit data → single summary row matching breedfile schema) and inserted into historical tables via a validation step.
- **Survival file release** is inherently retrospective (confirmed the following spring) — consistent with the existing one-year lag.

This architecture makes contamination of historical data **structurally impossible**, not just procedurally guarded.

### App Architecture

- Paper records remain primary. The app's role is **compliance monitoring and task scheduling**, not replacing paper.
- Stack must be maintainable by future biologists, not just developers — simplicity is a hard constraint.
- Supabase is the current backend. The app is a lightweight web app (mobile-first, runs on students' personal phones).
- Starlink provides Wi-Fi at the main cabin; cell service typically available on island.

### Protection Rules
- Never overwrite historical field data. Changes are new events, not edits to old records.
- Field app must never modify previous-season or proofed records.
- Nest parents come from `breed.male_id`/`female_id`, not from live territory lookup.
- Territory changes must not retroactively change nest parentage.
- Field app leaves `is_immigrant` NULL; historical imports fill NULLs.

## 7. Paper Records Reference

### Territory Card
Records per-visit: date, male/female observed (band combos), time spent, observation certainty, other birds seen, nest status. One card per territory per season.

### Nest Card
Two parts: **header** (summary fields filled progressively: DFE, DH, CS, #H, #B, #F, #I, stage of find, unhatched eggs, vegetation, height, failure cause, juvenile band combos) and **visit log** (date, time, contents, status, comments per visit).

### Band Book
Every banding event: color combo, metal band number, mass, tarsus, wing, beak measurements, territory, date, age, sex, fat score. Immigrants noted as "Immigrant banded on [date]."

### Fieldwork Ledger
Calendar grid: days across top, territories down side. Used to track visit schedule and plan upcoming fieldwork.

### Territory Maps
Paper maps with colored pens (one color per day). Record bird movements (dots + lines + band combos), song locations (dot with circle), nest sites (X with circle). Territory boundaries established around April 30 ± 2 weeks.

## 8. Population Context

- Major population crashes: 1988→1989 (209 → 28 birds), 2014→2015 (165 → 123), 2021→2022 (107 → 27).
- Immigration is low but constant (typically 0–6 per year).
- Recent population: ~25–30 birds. 2024 had only 10 actual nest records + 9 unmated males.
- No data from 1980 (study year gap).
- The study has produced data for genetic pedigree reconstruction, inbreeding analyses, survival modeling, and conservation genetics.

## 9. Fox Sparrow Parallel Study

FOSP monitoring uses the same conceptual protocol (territory mapping, nest finding, banding, reproductive tracking, survival). Key requirements:
- Clearly distinct interfaces in the app for SOSP vs FOSP to prevent cross-contamination.
- Territory maps are species-specific (SOSP and FOSP territories may overlap spatially).
- Data file structure should mirror SOSP where possible for analytical consistency.
- Currently a placeholder in the protocol — content to be added.

## 10. File Reference

| File | Description |
|------|-------------|
| `COMBINED_19752024_MandarteBreedfile_16March2026.xlsx` | Breedfile (3,645 nest attempts, 1975–2024) |
| `19752023_survival_file.xlsx` | Survival file (7,791 bird-years, 1975–2023) |
| `mandarte_project_instruction.md` | Master project instruction document |
| `mandarte_field_app_prd.md` | Field app product requirements document |
| `breedfile_README.md` | Breedfile column-by-column documentation |
| `breedfile_explanations.txt` | Amy Marr's 2003 breedfile explanation email |
| `survival_explanations.txt` | Amy Marr's 2003 survival file explanation email |
| `survival_file_description.txt` | Survival file construction notes |
| `MandarteFileChanges_10June2015.txt` | Pirmin Nietlisbach's change log |
| `Mandarte_FieldworkProtocol.pdf` | 2004 protocol (scanned, 22 pages; OCR required) |
| `2016_Scanned_Terr_Nest_Cards.pdf` | Example territory/nest cards from 2016 |
| `SOSP_nest_and_territory_maps_2018.pdf` | Territory and nest maps from 2018 |
| `SOSP_Band_Book_2018.pdf` | Band book example from 2018 |

## 11. Common Pitfalls

When working on this project, watch out for:

1. **Don't confuse `.` with NULL or 0.** In the Excel files, `.` means missing/unknown. `0` means observed zero. They are semantically different and must be handled correctly in any database migration.
2. **Don't assume `band` = number physically banded.** `#B` is the number of chicks that *reached* banding age (day 6), which may differ from the number that received bands.
3. **Don't treat nestrec as purely numeric.** Some values contain decimals (e.g., `2571.1`, `2939.1`).
4. **Don't assume territory codes are numeric.** Examples: "22A", "13/14", "17A".
5. **Don't use `origdfe` for analysis.** Use `corrDFE` (preferred) or `dfe`.
6. **Don't forget the backfilling logic** when interpreting reproductive counts. Later stages backfill earlier missing ones.
7. **Don't mix up `Year` and `year`.** `Year` = calendar year; `year` = study-year index (1 = 1975).
8. **Don't forget to exclude feeding experiments** (codes 3, 4.1, 4.2, 6) from survival and fitness analyses.
9. **Don't assume the survival file is up to date with the breedfile.** It inherently lags by one year.
10. **Don't write to historical tables from the field app.** Use staging tables and a release process.
11. **Band combos can be reused** after a bird dies. The 9-digit ninecode is the permanent unique ID.
12. **Attempt numbers are per-individual, not per-pair.** A female on her 2nd attempt may be paired with a male on his 3rd.
13. **`filenote = PB`** (partly built) nests should NOT be counted as breeding attempts.
14. **The 2004 protocol PDF is a ZIP of scanned JPEGs**, not a true PDF. Standard text extraction fails silently. Extraction requires: detect as ZIP → unzip → OCR JPEGs with pytesseract + PIL → concatenate.
