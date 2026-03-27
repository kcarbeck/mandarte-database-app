# Mandarte Field Data Collection App — Product Requirements Document

**Version:** 1.0
**Date:** March 20, 2026
**Author:** Katherine 
**Status:** Draft — v1 scoped for April 3, 2026 launch

---

## 1. Problem Statement

The Mandarte Island Song Sparrow study is a 50-year individual-based population study where every breeding bird is tracked through each season. Field data is recorded on paper territory cards, nest cards, and band books, then transcribed into Excel at season's end.

This workflow has three chronic failure modes:

1. **Missed visits and forgotten tasks.** The monitoring protocol has strict, timing-sensitive rules (band at day 6, fledge check day 12–14, revisit after failure every 4 days, etc.). When students fall behind on visits — as happened in 2025 — nests go unmonitored, fitness data becomes unreliable, and a full year of data can be compromised. There is no system that tracks what's due and flags what's overdue.

2. **No remote visibility.** The supervisor cannot see whether students are visiting territories on schedule, whether observations are complete, or whether nest cards are being properly maintained until data is entered at end of season — months too late to fix problems.

3. **Data gaps discovered too late.** Missing fields (DFE, fledge counts, failure codes) are only caught during post-season data entry and proofing, often when it's impossible to reconstruct what happened. Years 2020–2024 have systematic gaps in the breedfile that are now unrecoverable.

## 2. Product Vision

A mobile web app that serves as a **digital task scheduler and compliance monitor** running alongside the existing paper-based data collection system. Paper territory cards, nest cards, and band books remain the primary field records. The app ensures nothing falls through the cracks and gives the supervisor real-time visibility into field operations.

The app is **not** a database, though it will eventually integrate with one. This PRD covers the app only.

## 3. Users

| Role | Count | Device | Access |
|------|-------|--------|--------|
| Field student | 2 | Personal phones (possibly iPads) | All territories, self-assigning daily |
| Supervisor (Katherine) | 1 | Phone/laptop, remote from island | All territories, read + task creation |

All users see all territories. Students self-organize daily — there are no assigned territories.

## 4. Scope

### 4.1 In Scope (v1 — launch April 6, 2026)

- Song Sparrow (SOSP) monitoring only
- Digital territory visit logging
- Digital nest card (full lifecycle)
- Individual chick tracking post-banding (fledge and independence checks)
- Auto-generated task list based on protocol rules
- Overdue visit flagging with priority color coding
- Supervisor remote monitoring (compliance + data review)
- Supervisor task creation (territory-specific and general)
- Off-island day marking for schedule management
- Start-of-season setup (supervisor pre-loads returning birds; students add new territories and birds)
- End-of-season completeness check (all nest and territory cards must be filled out before departure)
- CSV export of all data

### 4.2 Out of Scope (v1)

- Fox Sparrow (FOSP) — added in v2 as a parallel but distinct interface
- Band book / banding measurements (stays paper-only; too time-sensitive for app entry)
- Territory map view with boundaries (v2 feature)
- Database integration (separate project; app exports CSV for now)
- Offline-first architecture (Starlink provides Wi-Fi at the main cabin; cell service typically available on island)

## 5. User Workflows

### 5.1 Daily Workflow — Field Student

1. **Morning:** Open app → see today's task list, auto-generated from protocol rules, sorted by priority. Tasks are color-coded:
   - 🔴 **Critical / time-sensitive:** Banding windows, overdue visits past protocol limit
   - 🟡 **Due today or soon:** Scheduled fledge checks, independence checks, routine visits coming due
   - 🟢 **Routine:** Standard territory checks, follow-ups
   - 📌 **Supervisor-added:** Flagged territories or general tasks
2. **Plan route:** Review tasks, mark self as "off island" if applicable (shifts task deadlines).
3. **In the field — territory visit:** Select territory → fill in visit form → submit. Repeat.
4. **In the field — nest check:** From territory view, select active nest → update nest card → submit. The app auto-schedules the next required action.
5. **End of day:** Review entries at camp. Sync happens automatically over Wi-Fi.

### 5.2 Daily Workflow — Supervisor (Remote)

1. **Check compliance dashboard:** Which territories are overdue? Are students visiting on schedule? Any auto-generated tasks being ignored?
2. **Review incoming data:** Spot-check territory visit notes and nest card updates. Are observations detailed enough? Are stage transitions sensible?
3. **Push tasks:** Add a task to a specific territory ("Check if female still present on Terr 14") or to the general task list ("Inventory banding supplies," "Refill water jugs").

### 5.3 Start of Season

1. Supervisor creates the season in the app and pre-loads:
   - Known returning birds (band combos from survival file / prior year data)
   - Territory stubs for areas likely to be occupied
2. Students arrive and begin establishing territories:
   - Assign males to territories as they are mapped
   - Add new birds (immigrants, newly banded) as encountered
   - Add females to territories as pairs form
3. Territory list grows organically through the early season.

### 5.4 End of Season

1. App runs a **completeness check** across all nest cards and territory cards:
   - Every nest card header field must be filled: DFE, DH, CS, #H, #B, #F, #I, stage of find, # unhatched eggs
   - Every banded chick must have a band combo entered
   - Every nest must have a final status (successful with independence count, or failed/abandoned with cause)
   - Every territory must have visit notes through the end of monitoring
2. App flags any incomplete cards. Students cannot consider fieldwork done until all flags are resolved.
3. Export all data as CSV.

## 6. Feature Specifications

### 6.1 Territory Visit Form

The territory visit log is the digital equivalent of entries on the paper territory card. Each visit is a timestamped record.

**Required fields:**
- Territory (pre-selected from list)
- Date (auto-filled, editable)
- Male observed (yes/no; band combo; color combo)
- Female observed (yes/no; band combo; color combo)
- Estimated time spent (free-text, in minutes)
- Notes (free-text — must be substantive enough to demonstrate the student was physically present; e.g., behavioral observations, locations within territory, other birds seen)

**Optional fields:**
- Other birds seen on territory (band combo entry)
- Nest status flag: no change / new nest found / existing nest checked (links to nest card)

**Design notes:**
- The notes field is the primary evidence that a visit occurred. The form should encourage detailed observations, not just checkbox compliance. Consider a minimum character count or prompt ("Describe what you observed").
- Time spent is a free-text estimate in minutes, not a start/stop timer, because students sometimes monitor adjacent territories simultaneously.
- Submitting a territory visit automatically updates the "last visited" date, which drives the task scheduler.

### 6.2 Nest Card

The digital nest card is a full parallel of the paper nest card. It has two parts: a **header** with summary fields that are progressively filled in as the nest advances, and a **visit log** with one entry per nest-related visit.

#### 6.2.1 Nest Card Header (Summary Fields)

These fields are filled in progressively as information becomes available, not all at once:

| Field | When populated | Notes |
|-------|---------------|-------|
| Territory | At creation | Links to parent territory |
| Male band combo + metal | At creation or when confirmed | |
| Female band combo + metal | At creation or when confirmed | |
| Male attempt number | At creation | Attempt # for this individual male this season |
| Female attempt number | At creation | Attempt # for this individual female this season |
| Stage of find | At creation | Stage when nest was first discovered: NB, EL, IC, HY, etc. |
| Clutch size (CS) | During laying/incubation | Total SOSP eggs |
| Date of first egg (DFE) | When calculable | Julian day; back-calculated from hatch date per protocol. App should auto-calculate when hatch date and clutch size are known. |
| Date of hatch (DH) | At hatching | Julian day; may be estimated from chick aging |
| # Hatched (#H) | At hatching | |
| # Banded (#B) | At banding (~day 6) | |
| # Fledged (#F) | After fledge check (day 12–14) | Updated based on individual sightings; may be revised upward over time |
| # Independent (#I) | After independence check (day 22–24+) | Updated based on individual sightings; may be revised upward over time |
| # Unhatched eggs | After hatching | |
| # Cowbird eggs | If applicable | |
| Nest height | When recorded | |
| Vegetation description | When recorded | Free text |
| Nest description | When recorded | Free text |
| Failure cause | If nest fails | Picker from failcode list (codes 1–23; code 24 = success) |
| Juvenile band combos | At banding | One entry per banded chick; combo + metal band number |

**Design notes:**
- #F and #I should NOT be finalized immediately after a single check. Protocol says these can be revised upward if more juveniles are seen later. The app should allow updates.
- DFE auto-calculation: DFE = DH - incubation period (13 days) - (CS - 1). One egg laid per day. Adjust for cowbird eggs per protocol. Flag with uncertainty indicator if inputs are estimated.

#### 6.2.2 Nest Visit Log

Each visit to a nest adds a row to its log, mirroring the paper card's date/time/contents/status/comments table:

| Field | Type | Notes |
|-------|------|-------|
| Date | Auto-filled | |
| Time | Auto-filled or manual | |
| Contents observed | Structured + free text | What was seen: egg count, chick count, chick age estimate, band combos present, cowbird activity |
| Nest status | Picker | Current stage in the progression (see 6.2.3) |
| Comments | Free text | |

#### 6.2.3 Nest Stage Progression

A nest progresses through stages. The app should only allow forward progression (or transition to failed/abandoned at any stage), not backward:

```
Building → Laying → Incubating → Nestling (D1...D14) → Fledged → Independent
                                                    ↘            ↘
At any stage ──────────────────────────────────→ Failed / Abandoned
```

**Nestling sub-stages:** Once chicks hatch, the app should track nestling age as "D1" through "D14" (days since hatch), auto-calculated from the recorded hatch date when known, or once chicks are aged at banding or at a nest finding. If hatch date is unknown (e.g., nest found with chicks), the student estimates chick age and the app back-calculates.

**Failed:** Nest failed — requires selection of failure cause from the failcode list.

**Abandoned:** Nest abandoned — a specific subset of failure.

#### 6.2.4 Individual Chick Tracking (Post-Banding)

Once chicks are banded (~day 6), the app creates an individual record for each chick linked to the nest. From this point forward, fledge and independence checks track individuals, not just counts.

At each **fledge check** (day 12–14) and **independence check** (day 22–24+), the student reviews each banded individual and marks:

| Status | Meaning |
|--------|---------|
| Seen | Bird observed alive |
| Not seen | Not observed (does NOT mean dead) |
| Confirmed dead | Physical evidence of death found |

The nest card's #F and #I tallies derive from these individual records (count of "seen" at fledge, count of "seen" at independence), but can be revised upward as additional sightings occur over subsequent days. Kids are often seen when doing territory monitoring becuase the parents may start to build a new nest. So they can mark this then.

### 6.3 Task Engine

The task engine is the highest-value feature. It auto-generates tasks based on protocol rules, using data entered through territory visits and nest cards.

#### 6.3.1 Auto-Generated Task Rules

| Trigger | Generated task | Priority | Due |
|---------|---------------|----------|-----|
| Territory with active nest (building, eggs), or territory with Female | Territory visit | 🟡 | Every 3-5 days (max 7) from last visit |
| Territory — single male, no suspected female | Territory visit | 🟢 | Every 5-10 days |
| Territory — single male, female suspected | Territory visit | 🟡 | Every 5 days |
| Nest — chicks hatched, approaching day 6 | **Band chicks** | 🔴 | Hatch date + 4-6 days |
| Nest — chicks banded, approaching day 12 | **Fledge check** | 🟡 | Hatch date + 12 days |
| Nest — fledge confirmed, approaching day 22 | **Independence check** | 🟡 | Hatch date + 22 days |
| Nest failed | Revisit territory for re-nest | 🟡 | Last active date + 10 days, then every 4 days |
| Nest failed, 20+ days with no re-nest | Intensive revisit | 🔴 | Every 2 days |
| Any task past its due date | Overdue flag | 🔴 | Immediate |

#### 6.3.2 Safety Warnings

The app should display prominent warnings for timing-critical rules:

- **Day 9–11 warning:** "DO NOT approach nest — chicks will jump prematurely with high mortality." Displayed when a nest is between D9 and D11 post-hatch.
- **Day 7 banding warning:** "Banding at day 7 — handle with extreme care, chicks may jump. Keep hand over nest until they settle."
- **Day 3 emergency banding:** "Emergency banding only — one band per leg (1 metal, 1 color)."

#### 6.3.3 Supervisor-Created Tasks

The supervisor can create two types of tasks:

1. **Territory-specific tasks:** Linked to a territory, appear in that territory's task list. Example: "Check if female still present," "Look for re-nest in northwest corner."
2. **General tasks:** Not linked to a territory. Appear on a separate general task list visible to all users. Example: "Inventory banding supplies," "Refill water containers," "Send water taxi schedule to operator."

All tasks (auto-generated and manual) have:
- Description
- Priority level
- Due date (auto-calculated or manually set)
- Status: open / completed / dismissed
- Completion notes (free text, filled when marking complete)

### 6.4 Compliance Dashboard (Supervisor View)

The supervisor needs two views:

#### 6.4.1 Schedule Compliance View

- **Territory list** with last-visited date and days since last visit, color-coded by urgency
- **Overdue task count** per territory
- **Active nest summary** per territory with current stage and next scheduled action
- **Off-island calendar** showing which days students marked as off-island
- **Overall metrics:** % of tasks completed on time this week, number of overdue tasks

#### 6.4.2 Data Completeness View

- **Nest cards** with completeness indicator (which header fields are still empty)
- **Ability to drill into any nest card** and review the visit log
- **Territory visit logs** — ability to read student notes and assess quality
- **End-of-season completeness report** listing all cards with missing required fields

### 6.5 Off-Island Day Marking

Students can mark specific days as "off island" (for resupply, weather, days off, etc.). When a student marks a day:

- Tasks due that day are not flagged as overdue; their due dates shift accordingly
- The task list for that day shows a reduced/rescheduled view
- The supervisor can see the off-island calendar to understand gaps

### 6.6 CSV Export

All data must be exportable as CSV files for analysis, archiving, and eventual database integration. Export should produce:

1. **Territory visits:** One row per visit (territory, date, time, observer, minutes, male_seen, female_seen, notes, nest_status_flag)
2. **Nest cards — header data:** One row per nest (all header fields from 6.2.1)
3. **Nest cards — visit log:** One row per nest visit (nest_id, date, time, contents, status, comments)
4. **Individual chick records:** One row per chick per check (nest_id, chick_band_combo, chick_metal_band, check_type [fledge/independence], date, status [seen/not_seen/confirmed_dead])
5. **Tasks:** One row per task (type, territory, description, priority, due_date, status, completion_date, completion_notes)

## 7. Data Model (App-Level)

The app needs to track these entities and their relationships. This is NOT a database schema — it describes the data the app manages internally.

### Entities

**Season**
- Year, start date, end date, species (SOSP for v1)

**Territory**
- Territory ID/code, season, resident male (band combo + metal), resident female (band combo + metal), status (active/abandoned), notes

**Bird**
- Band combo (color), metal band number (9-digit), species, sex, age (if known), natal year (if known), immigrant flag

**Nest**
- Linked to territory, male (band combo + metal), female (band combo + metal), attempt number (male), attempt number (female), all header fields from 6.2.1, current stage, final status

**Nest Visit**
- Linked to nest, date, time, observer, contents, status, comments

**Territory Visit**
- Linked to territory, date, time, observer, minutes spent, male seen, female seen, other birds seen, notes, nest status flag

**Individual Chick**
- Linked to nest, band combo (color), metal band number, banding date

**Chick Check**
- Linked to individual chick, check type (fledge/independence), date, status (seen/not seen/confirmed dead)

**Task**
- Type (auto-generated / supervisor-created), linked to territory (optional), description, priority, due date, status, created by, completed by, completion date, completion notes

**Off-Island Day**
- User, date, reason (optional)

**User**
- Name, role (student/supervisor), email

### Key Relationships

- A territory has many nests (sequentially, as re-nesting occurs)
- A nest has many nest visits (chronological log)
- A nest has many individual chicks (created at banding)
- A nest has 2 parents (male and female)
- An individual chick has many chick checks (fledge, independence, additional sightings)
- A territory has many territory visits
- A territory has at least one male associated with it. Can have a female. Individuals may switch territories or create new territories as well.
- A territory has many tasks
- A task can be territory-specific or general (territory link is optional)

## 8. Non-Functional Requirements

### 8.1 Device Compatibility

- Must work on modern mobile browsers (Safari on iOS, Chrome on Android)
- Touch-friendly UI — form inputs must be easily tappable on a phone screen in outdoor conditions (consider larger touch targets, high-contrast text)
- Must also work on laptop/desktop browsers for supervisor use

### 8.2 Connectivity

- App assumes internet connectivity via Starlink (Wi-Fi at cabin) and cell service on island
- App should gracefully handle brief signal drops (e.g., don't lose form data if connection blips while submitting — queue and retry)
- Full offline-first architecture is NOT required for v1

### 8.3 Data Safety

- No data should be lost due to connectivity issues. If a form submission fails, the app should retain the data locally and retry.
- All data must be exportable as CSV at any time.
- The app does not replace or modify any existing data files (breedfile, survival file, Excel archives). It is an independent system.

### 8.4 Simplicity and Maintainability

- This project will change hands over time. Future maintainers will be biologists, not software developers.
- The codebase must be simple, well-documented, and understandable to someone with basic coding skills assisted by AI tools like Claude Code.
- Minimize dependencies and framework complexity.
- Prefer explicit, readable code over clever abstractions.

### 8.5 Performance

- Form submission should feel instant. No multi-second waits.
- Task list should load in under 2 seconds on a phone over reasonable connectivity.
- Data volumes are small (dozens of territories, dozens of nests per season, hundreds of visits) — performance is not expected to be a challenge.

## 9. Success Criteria

For the 2026 field season, the app is successful if:

1. **No missed banding windows.** Every nest that reaches day 6 has a banding task generated and completed (or explicitly noted as missed with explanation).
2. **Visit compliance is visible.** The supervisor can, at any point during the season, see which territories are overdue and by how many days.
3. **Students use the app daily.** Task list drives their fieldwork planning; territory visits and nest updates are logged consistently.
4. **End-of-season cards are complete.** The completeness check identifies all gaps before students leave the island.
5. **Data is exportable.** CSV export produces clean, complete records for the season.

## 10. Timeline and Phasing

### Phase 1 — Launch (by April 6, 2026)

Minimum viable product:
- Territory list with ability to add territories and assign birds
- Territory visit form
- Nest card (header + visit log + stage tracking)
- Basic task list (manually created by supervisor)
- CSV export

### Phase 2 — During Season (April–May 2026)

Iterative additions as students use the app:
- Auto-generated tasks from protocol rules (the full task engine from 6.3)
- Individual chick tracking post-banding
- Overdue visit flagging and priority color coding
- Safety warnings (day 9–11, etc.)
- Off-island day marking

### Phase 3 — Mid/Late Season (June–July 2026)

- Compliance dashboard for supervisor
- End-of-season completeness check
- Data completeness view
- Refined CSV export matching breedfile column structure

### Phase 4 — Post-Season / Future

- Fox Sparrow (FOSP) parallel interface
- Map-based territory view
- Database integration (separate project)
- Year-over-year data persistence (decision deferred)

## 11. Open Questions

1. **Year-over-year persistence:** Should the app carry forward bird IDs, territory history, and prior-year data? Or start fresh each season with manual pre-loading? Decision deferred.
2. **DFE auto-calculation:** Should the app enforce the protocol's DFE back-calculation formula, or just provide a helper tool that the student can override? (Formula: DFE = DH - 13 - (CS - 1), adjusted for cowbird eggs.)
3. **Cowbird tracking depth:** How detailed should cowbird egg/chick tracking be in the app for v1? Minimal (just a count field) or full parallel tracking?
4. **Photo attachments:** Would it be useful to attach photos to nest visits (e.g., photo of nest contents, chick age reference)? Adds complexity but could aid remote data review.
5. **Multiple observers per visit:** Can two students visit a territory together and both need credit, or is one observer per visit entry sufficient?
6. **Band combo entry UI:** What's the fastest way to enter band combos on a phone? Free text ("dbm.gr"), picker with color buttons, or something else? This is a high-frequency interaction and the UX matters.

## Appendix A: Failcode Reference

| Code | Cause |
|------|-------|
| 1 | Mouse droppings |
| 2 | Shell remains / yolk evidence |
| 3 | Egg punctured but not eaten, kicked egg outside nest |
| 4 | Lining disturbed or pulled |
| 5 | Nest tilted |
| 6 | Nest overturned / demolished / gone |
| 7 | Vegetation parted or trampled |
| 8 | Female died |
| 9 | Abandoned, all eggs present |
| 10 | Abandoned, egg loss |
| 11 | Sparrow eggs replaced with cowbird eggs, nest abandoned |
| 12 | Empty intact, no signs of disturbance |
| 13 | Mouse droppings + egg shells |
| 14 | Mouse droppings + lining disturbed |
| 15 | Egg shells + lining disturbed |
| 16 | Lining pulled + nest tilted |
| 17 | Lining pulled + vegetation parted |
| 18 | Young beaten / hole in head / broken legs, chick dead or alive outside nest before fledge age but not eaten |
| 19 | Young starved, intact but dead in nest |
| 20 | Legs or wings of nestlings found in or near nest |
| 21 | Eggs remain but hatched young gone, no signs |
| 22 | Human accident / experiment |
| 23 | Other |
| 24 | **Success** |

## Appendix B: Stage of Find Codes

| Code | Meaning |
|------|---------|
| NB | Nest building |
| EL | Egg laying |
| IC | Incubating (most common — 2,519 of 3,645 historical records) |
| HY | Hatch year (found with chicks) |
| MTD | Male on territory, details known |
| MTUK | Male on territory, unknown details |
| EAF | Empty after fledge |
| FY | Fledged young |
| NFN | Not found as nest |
| UK | Unknown |

## Appendix C: Band Combo Color Abbreviations

| Abbreviation | Color |
|-------------|-------|
| m | Metal |
| r | Red |
| o | Orange |
| y | Yellow |
| g | Green |
| b | Light blue |
| db | Dark blue |
| p | Purple |
| w | White |

Read order: left top, left bottom, right top, right bottom. Example: **dbm.gr** = dark blue + metal (left leg), green + red (right leg). The dot separates left leg from right leg.
