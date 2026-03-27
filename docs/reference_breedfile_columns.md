# Mandarte Breedfile

> This README documents every column present in the `breedfile`. I compiled it from the file itself and two text files (`breedfile_explanations.txt` by Amy Marr and `MandarteFileChanges_10June2015.txt` change log). Where historic practice varies, I note the current canonical interpretation and any flags.

## Project-wide conventions

- **Missing values:** represented by a single dot `.` across the file (R‑compatibility change, 2015).  
- **Uncertainty symbols:** historical use of `?`, `+`, `-` to indicate uncertain counts or minimum/maximum values. Several outcome columns have paired `q` fields (e.g., `eggs`/`eggsq`). A separate `QuestionmarkPlusMinus` column stores legacy `? / + / -` flags that previously lived in a column literally named `? / + / -` (renamed for software compatibility).  
- **Backfilling logic:** during harmonization, outcome columns were backfilled so that `fledge = indep` when `fledge` missing and `band = fledge` when `band` missing. If you are analyzing the data, you should use stage filters (e.g., `stagfind`) to limit bias from late‑found nests.

### DFE, corrDFE, dfeq, origdfe (Date of First Egg)
 Notes from Peter:
 - Prior to 1990's, most observers only indicated DFE when it was certain, based on observations of laying and/or nestling age.  However, thereafter, PA has used the territory and nest cards to estimate DFE in the case it can be done within 7d of the presumed true date.  
    - I.e., if a female was NI on 1 June,  and Incubating 3 June, I assume Inc began on June 2 and count back from hatch, or if they didn't hatch, go with that assumption. 
- Overall, my approach since early 1990's has been to assign a DFE if it can be done +-3.5 days of presumed true data. Because I had to return to all nests to add DFE's, they are entered with a 'q' if uncertain by some criteria, or corrDFE if corrected by me according to cards.
- These days, we typically (I think) use the criteria I have used to enter DFE +- 3.5d. So I am unsure how 'dfecorr' has been used over last few years.  My personal suggestion would be to use the most complete column of DFE or DFEcorr, perhaps checking to ensure they don't differ; i.e., IMO DFE and DFEcorr should be the same and DFEq outdated.

---

## Column-by-column

### Identification & timing
- **`nestrec`** — unique nest‑attempt identifier; used to track continuity across historical file versions and corrections. Some early placeholders were purged. Now we just fill the next consecutive number for subseuqnet nests.
- **`Year`** — calendar year (1975–20XX).  
- **`year`** — study‑year index (e.g., 1 = 1975).

### Territory & individuals
- **`terr`** — territory code of the nest location.  
- **`male`**, **`female`** — band IDs of social parents.  
- **`maleage`**, **`femage`** — age (years) of male/female.  
- **`maleatt`**, **`fematt`** — male/female attempt number within season.  
- **`brood`** — successful brood sequence for the pair/territory in the season.

### Nest coordinates
- **`UTM_Nest_X`**, **`UTM_Nest_Y`** — UTM coordinates of nest location.  
- **`orig_Nest_X`**, **`orig_Nest_Y`** — original x y coordinates of nest lcoation.  
  _Caution:_ to my knowledge, the original coordinate data were not comprehensively proofed; avoid fine‑scale spatial inference from those years without card verification.

### Date of first egg (DFE)
- **Historical practice (pre‑1990s):** DFE typically entered only when directly supported by observations (laying/nestling age).  
- **Practice since early 1990s:** DFE may be **inferred** from territory/nest cards and stage transitions when it can be assigned within about **±3.5 days** (earlier notes referenced “within 7 days of the presumed true date”; current practice is ±3.5 d). Such cases may be flagged uncertain in paired `dfeq` or corrected later in `corrDFE`.  
- **`dfe`** — date of first egg for the clutch when it was directly observed or could be inferred reliably. 
- **`corrDFE`** — corrected DFE from 2014 review. Differences are generally small but can be larger in earlier records. 
- **`dfeq`** — uncertainty flag for `dfe` (`?`, `+`, `-`, or `.`).  
- **`origdfe`** — original DFE value (pre‑harmonization). do not use this data unless to understand why some analysis may have changed slightly from something that was previously observed, this was necessary because dfe has not been entered consistently thru time, some observers required a much higher level of certainty than others and Peter and Jamie wanted certainty within a week 

> **Recommendation:** For analyses, prefer `corrDFE` when present; otherwise use `dfe`. If both exist and differ materially, inspect the cards/notes.

### Reproduction counts (host)
- **`eggs`**, **`hatch`**, **`band`**, **`fledge`**, **`indep`** — counts of eggs laid; young hatched; young **reaching banding age** (~day‑6); young fledged; independent young.  
- **`eggsq`**, **`hatchq`**, **`bandq`**, **`fledgeq`**, **`indepq`** — paired uncertainty flags (`?` = uncertain; `+` = more possible; `-` = possible overcount; `.` = none).
    -  'q' was introduced by Amy Marr, because as we updated shared files for the 2000 book, we had different tolerances for difference analyses.  
    - E.g., if someone saw 4 chicks on first visit to a nest, CS was assumed to be 4 given that we almost never have 5's.  But for some analyses, only those CS's which were seen prior to hatch were entered without a -/+ or ?, depending on cards.  Or, if a nest had a Cow egg, we'd typically use a ? Or leave blank unless the clutch was observed before being parasitized.  All in all, however, the 'q' columns have not been consistently used, mainly because I've only trained people to enter data on Nest cards when observations are made directly and/or almost certainly made on sound assumptions.  

### Brown‑headed cowbird fields (parasitism)
- **`cowegg`**, **`cowhatch`**, **`cowband`**, **`cowfled`** — counts for cowbird stages parallel to SOSP counts

### Offspring identity
- **`kid1` … `kid5`** — band IDs of individual young associated with the attempt. Some fledglings were unbanded yet later recruited; genetics/card notes in the 2010s linked a few such cases.

### Stage / outcomes / metadata
- **`stagfind`** — stage at first discovery. 
    - NB = nestbuilding
    - MTD = found empty nest, shows signs it once had eggs
    - MTUK = found empty nest, nest either never used or already failed after use
    - EL = egg laying
    - EAF = eggs or shells present in nest but nest found after fail
    - IC = incubating
    - HY = hatched young
    - FY = fledged young
    - NFN = never found nest
    - UK = unknown (observations too confusing to assign stage of find)
- **`recruits`** — number of young from this attempt that later recruited. Post‑2003 this is mostly `.` because recruitment is tracked primarily in the survival file.  
- **`eggslaid`** — were eggs laid in this nest? 
    - Y = yes
   - U = unknown
    - N = no
- **`wholeclutch`** — was the entire clutch observed (bird seen **incubating**)? 
    - Y = yes, bird seen incubating the nest
    - N = no or can't be certain because bird was not seen INCUBATING the nest
- **`stagfail`** — stage at failure (if failed). Need to confirm numbers here
- **`failcode`** – why the nest failed.
    The failcode categories are:
   - 1    Mouse shit
   - 2    Shell remains or evidence of yolk
   - 3    Egg punctured but not eaten, kicked egg outside  nest
   - 4    Lining disturbed or pulled 
   - 5    Nest tilted
   - 6    Nest overturned/ demolished/ gone
   - 7    Vegetation parted or trampled
   - 8    Female died
   - 9    Abandoned, all eggs present
   - 10    Abandoned, egg loss
   - 11    Sparrow eggs replaced with cowbird eggs and nest abandoned
   - 12    Empty intact, no signs of disturbance
   - 13    Mouse shit + egg shells
   - 14    Mouse shit + lining disturbed
   - 15    Egg shells + lining disturbed
   - 16    Lining pulled + nest tilted
   - 17    Lining pulled + veg parted
   - 18    Young beaten/ hole in head/ broken legs in nest, chick dead or alive outside of nest prior to fledge age but not eaten by the predator
   - 19    Young starved, intact but dead in nest
   - 20    Legs or wings of nestlings found in or near nest
   - 21    Eggs remain in nest but hatched young gone, no signs 
   - 22    Human accident/ experiment
   - 23    Other
   - 24    Success 
- **`brokegg`** — broken egg count.
- **`expt`** — experiment code (exclude feeding/disturbance experiments for analyses):  
   - 1 = 1975 brood swap
   - 2 = 1979 mate removal
   - 3 = 1979 feeding at start of season or close neighbor and with likely access,VERY IMPORTANT TO EXCLUDE
    - 4.1 = 1985 feeding expt neighbor, VERY IMPORTANT TO EXCLUDE 
    - 4.2 = 1985 feeding expt fed bird, VERY IMPORTANT TO EXCLUDE 
    - 5 = 1986 cross foster
    - 6 = 1988 Wes's feeding expt birds or close neighbor with likely access, VERY IMPORTANT TO EXCLUDE
    - 7 = 1996 Rothstein egg expt, not sure if this affected nest success
   - 8 = 1997,1998 3 nest attempts were disrupted by temperature probe expt,female probably abandoned due to temperature probe, other birds were not coded because they were not influenced
- **`filenote`** — e.g., `'PB'` = partly built nests; not counted as attempts in cumulative counts (only some years).  
- **`failenotes`** — free‑text elaboration on failure. 
- **`othernotes`** — free‑text notes.  
- **`Unhatch`** — free-text/count of unhatched eggs (e.g., “fertilized d7”, “1 unfertilized”).  
- **`QuestionmarkPlusMinus`** — storage of legacy `? / + / -` flags from the original special‑character column. Uncertain of what this means still?



