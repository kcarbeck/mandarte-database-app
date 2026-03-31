# Nest Card Interface Specification

## Principle
The nest card in the app must mirror the breedfile structure. What students enter on the nest card is what gets stored in the `breed` table. Every column in `breed` should either be:
- Directly editable on the nest card, OR
- Auto-calculated from other fields (like DFE), OR
- Set once at nest creation (like territory, year), OR
- Filled during proofing/end-of-season review

## Current State vs. Required

### Fields currently on the form
| Field | Status | Notes |
|-------|--------|-------|
| eggs | ✅ OK | |
| hatch | ✅ OK | |
| band | ✅ OK | # actually banded (see note below) |
| fledge | ✅ OK | Updated throughout season |
| indep | ✅ OK | Updated throughout season |
| dfe | ✅ Auto-calculated | From date_hatch + eggs |
| date_hatch | ✅ Auto-derived | From nest visit chick age estimates |
| corr_dfe | ✅ OK | Read-only for historical; blank for new data |
| cow_egg | ✅ OK | |
| cow_hatch | ✅ OK | |
| fail_code | ✅ OK | Dropdown from lookup_failcode |
| whole_clutch | ✅ OK | Y/N |
| unhatch | ✅ OK | Free text/count |
| nest_height | ✅ OK | Meters |
| vegetation | ✅ OK | Free text |
| nest_description | ✅ OK | Free text |
| kid1-kid5 | ⚠️ NEEDS UPDATE | Currently just band_id. Must also show/set color combo |
| other_notes | ✅ OK | |

### Fields MISSING from form (need to add)
| Field | Priority | Notes |
|-------|----------|-------|
| stage_find | HIGH | Currently displayed but not editable. Should be editable dropdown. |
| eggs_laid | HIGH | Y/N/U dropdown — "Were eggs laid?" |
| eggs_quality | MEDIUM | Uncertainty flag dropdown (., ?, +, -) |
| hatch_quality | MEDIUM | Same dropdown |
| band_quality | MEDIUM | Same dropdown |
| fledge_quality | MEDIUM | Same dropdown |
| indep_quality | MEDIUM | Same dropdown |
| dfe_quality | MEDIUM | Same dropdown |
| brood | MEDIUM | Successful brood # for this pair in the season |
| male_attempt | MEDIUM | Male's attempt # this season |
| female_attempt | MEDIUM | Female's attempt # this season |
| stage_fail | MEDIUM | Stage at failure. Same codes as stage_find. |
| cow_band | LOW | # cowbird chicks at Day 6. TEXT. |
| cow_fledge | LOW | # cowbird chicks fledged. TEXT. |
| broke_egg | LOW | # broken eggs found. TEXT. |
| fail_notes | LOW | Free text elaboration on failure |
| experiment | LOW | Experiment code. Almost always "0" for new data. |
| file_note | LOW | PB = partly built nest |

### Fields set at nest creation (NOT on update form)
| Field | Set by |
|-------|--------|
| nestrec | Auto-generated |
| year | Current season year |
| territory | Selected when creating nest |
| male_id | From territory residents at time of nest creation |
| female_id | From territory residents at time of nest creation |

### Fields that are auto-calculated (NOT manually entered)
| Field | Calculated from |
|-------|----------------|
| dfe | date_hatch - 13 - (eggs - 1) |
| date_hatch | Best nest visit with chick age estimate |
| study_year | year - 1974 |
| recruits | Query: count kid1-5 that appear in survival with age >= 1 |

## Chick Banding (kid1-kid5)

Each chick must have:
1. **Metal band number** (ninecode) — the `kid1`-`kid5` fields in breed, linking to `birds.band_id`
2. **Color band combo** — stored on the `birds` table as `color_combo`

The UI should show both when entering kids:
- Input for metal band number
- Input for color combo (using the band color picker from the birds page)
- Both are saved: band number → `breed.kid1` (etc), combo → `birds.color_combo`

If a chick is unbanded (missed at banding), it should still be trackable:
- Create an unbanded bird entry (negative band_id, is_unbanded = true)
- Set kid slot to that negative band_id
- Note in unbanded_description: "Unbanded chick from Nest #X, Territory Y"

## Nest Stage (IMPLEMENTED)

`nest_visits.nest_stage` uses simplified stages. Specific nestling day goes in `chick_age_estimate`:
- `building` — Nest under construction
- `laying` — Eggs being laid (incomplete clutch)
- `incubating` — Full clutch, female incubating
- `nestling` — Chicks in nest (enter specific day in chick_age_estimate field)
- `fledged` — Young have left nest
- `independent` — Young seen independently (Day 22-24+)
- `failed` — Nest failed
- `abandoned` — Nest abandoned

Note: Historical data may contain per-day values (e.g., `nestling_D5`). These display correctly in the visit log but are not available for new entry.

## Time-Gated Tasks

Certain checks must happen within specific time windows relative to hatch date:

| Task | When | Protocol Reference |
|------|------|--------------------|
| Banding | Day 5-7 (ideally Day 6) | "Band on day 6 when pins are breaking through sheaths" |
| Fledge check | Day 12-14 | "Check if young have fledged around day 12" |
| Independence check | Day 22-24 | "Check for independence at day 22-24" |

The app should:
1. Once hatch date is estimated, calculate the target dates for each check
2. Show these as upcoming tasks on the territory/nest overview
3. NOT block data entry outside these windows (students may check early/late)
4. Flag if a check was done unusually early or late for proofing review

## Parent Assignment (FIXED)

Parents are now loaded from `breed.male_id` and `breed.female_id` — the actual
parents of THIS nest — not from current territory residents. If a female leaves
a territory, old nests retain their original parent assignment.

Territory residents are only used as *suggestions* when a nest has no parents set yet.
These are shown with "(suggested)" label and must be confirmed.

When a nest is first created, `male_id` and `female_id` are set from the current
territory residents. After that, they are locked to the nest record.
