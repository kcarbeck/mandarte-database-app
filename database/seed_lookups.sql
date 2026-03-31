-- =============================================================================
-- Mandarte Island Song Sparrow Study — Lookup Table Seed Data
-- Run this AFTER schema.sql to populate all lookup/reference tables.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- lookup_sex
-- -----------------------------------------------------------------------------
INSERT INTO lookup_sex (code, description) VALUES
    (0, 'Unknown (all independent juveniles coded 0, even if sex is later determined)'),
    (1, 'Female'),
    (2, 'Male');


-- -----------------------------------------------------------------------------
-- lookup_failcode
-- Cause of nest failure. Code 24 = success (not a failure).
-- Source: Amy Marr 2003 email, breedfile_README.md
-- -----------------------------------------------------------------------------
INSERT INTO lookup_failcode (code, description, category) VALUES
    ('1',  'Mouse droppings',                                                          'Predation sign'),
    ('2',  'Shell remains or evidence of yolk',                                        'Predation sign'),
    ('3',  'Egg punctured but not eaten, kicked egg outside nest',                     'Predation sign'),
    ('4',  'Lining disturbed or pulled',                                               'Predation sign'),
    ('5',  'Nest tilted',                                                              'Predation sign'),
    ('6',  'Nest overturned / demolished / gone',                                      'Predation sign'),
    ('7',  'Vegetation parted or trampled',                                            'Predation sign'),
    ('8',  'Female died',                                                              'Mortality'),
    ('9',  'Abandoned, all eggs present',                                              'Abandonment'),
    ('10', 'Abandoned, egg loss',                                                      'Abandonment'),
    ('11', 'Sparrow eggs replaced with cowbird eggs, nest abandoned',                  'Cowbird parasitism'),
    ('12', 'Empty intact, no signs of disturbance',                                    'Unknown cause'),
    ('13', 'Mouse droppings + egg shells',                                             'Predation sign (combination)'),
    ('14', 'Mouse droppings + lining disturbed',                                       'Predation sign (combination)'),
    ('15', 'Egg shells + lining disturbed',                                            'Predation sign (combination)'),
    ('16', 'Lining pulled + nest tilted',                                              'Predation sign (combination)'),
    ('17', 'Lining pulled + vegetation parted',                                        'Predation sign (combination)'),
    ('18', 'Young beaten / hole in head / broken legs, chick dead or alive outside nest before fledge age but not eaten', 'Predation sign'),
    ('19', 'Young starved, intact but dead in nest',                                   'Starvation'),
    ('20', 'Legs or wings of nestlings found in or near nest',                         'Predation sign'),
    ('21', 'Eggs remain but hatched young gone, no signs',                             'Unknown cause'),
    ('22', 'Human accident / experiment',                                              'Human cause'),
    ('23', 'Other',                                                                    'Other'),
    ('24', 'Success',                                                                  'Success');

-- Historical anomaly codes (preserved for import compatibility):
INSERT INTO lookup_failcode (code, description, category) VALUES
    ('0', 'Missing/unassigned (historical)', NULL)
ON CONFLICT (code) DO NOTHING;
-- Additional raw-data anomalies not added to lookup (cleaned during import):
-- '5,6'  — two failure signs entered in one cell
-- 'ENTE' — apparent typo


-- -----------------------------------------------------------------------------
-- lookup_stagfind
-- Stage at which nest was first discovered.
-- Source: Amy Marr 2003 email, breedfile_README.md
-- -----------------------------------------------------------------------------
INSERT INTO lookup_stagfind (code, description) VALUES
    ('NB',   'Nest building'),
    ('EL',   'Egg laying'),
    ('IC',   'Incubating (most common — ~69% of historical records)'),
    ('HY',   'Hatched young (found with chicks)'),
    ('FY',   'Fledged young'),
    ('MTD',  'Found empty nest, shows signs it once had eggs'),
    ('MTUK', 'Found empty nest, nest either never used or already failed after use'),
    ('EAF',  'Eggs or shells present in nest but nest found after fail'),
    ('NFN',  'Never found nest'),
    ('UK',   'Unknown (observations too confusing to assign stage)');

-- Historical anomaly codes (preserved for import compatibility):
INSERT INTO lookup_stagfind (code, description) VALUES
    ('AF', 'After fail (historical variant of EAF)'),
    ('B',  'Building (historical variant of NB)'),
    ('EG', 'Eggs (historical variant of EL)'),
    ('NY', 'Nestlings/young (historical variant of HY)')
ON CONFLICT (code) DO NOTHING;


-- -----------------------------------------------------------------------------
-- lookup_experiment
-- Experiment codes. CRITICAL: codes marked exclude_from_analysis = TRUE
-- must be filtered out of most scientific analyses.
-- Source: Amy Marr 2003 email, breedfile_README.md
-- -----------------------------------------------------------------------------
INSERT INTO lookup_experiment (code, description, year_conducted, exclude_from_analysis) VALUES
    ('0',   'No experiment',                                                      NULL,        FALSE),
    ('1',   'Brood swap',                                                         '1975',      FALSE),
    ('2',   'Mate removal',                                                       '1979',      FALSE),
    ('3',   'Feeding experiment (at start of season or close neighbor with likely access)', '1979', TRUE),
    ('4.1', 'Feeding experiment (neighbor)',                                       '1985',      TRUE),
    ('4.2', 'Feeding experiment (fed bird)',                                       '1985',      TRUE),
    ('5',   'Cross-foster',                                                       '1986',      FALSE),
    ('6',   'Wes''s feeding experiment (birds or close neighbor with likely access)', '1988',   TRUE),
    ('7',   'Rothstein egg experiment (uncertain if it affected nest success)',    '1996',      FALSE),
    ('8',   'Temperature probe experiment (3 nests disrupted; female probably abandoned due to probe)', '1997-1998', FALSE),
    ('9',   'UNDOCUMENTED — code appears in breedfile data but no written documentation exists. Needs investigation.', 'Unknown', FALSE);


-- -----------------------------------------------------------------------------
-- lookup_eggslaid
-- Were eggs laid in this nest?
-- -----------------------------------------------------------------------------
INSERT INTO lookup_eggslaid (code, description) VALUES
    ('Y', 'Yes, eggs were laid'),
    ('N', 'No eggs were laid'),
    ('U', 'Unknown');

-- Historical anomaly codes:
INSERT INTO lookup_eggslaid (code, description) VALUES
    ('.', 'Missing/not recorded (historical)')
ON CONFLICT (code) DO NOTHING;
-- Also: lowercase 'y' and '?' in raw data → normalized to 'Y' and 'U'.


-- -----------------------------------------------------------------------------
-- lookup_wholeclutch
-- Was the entire clutch observed (bird seen incubating)?
-- -----------------------------------------------------------------------------
INSERT INTO lookup_wholeclutch (code, description) VALUES
    ('Y', 'Yes — bird was seen incubating (clutch is complete)'),
    ('N', 'No — bird was not seen incubating, so clutch completeness is uncertain');

-- Historical anomaly: lowercase 'y' and '?' appear in raw data.
-- Normalized to 'Y' and 'N' in working layer.


-- -----------------------------------------------------------------------------
-- lookup_filenote
-- File-level notes about nest records.
-- -----------------------------------------------------------------------------
INSERT INTO lookup_filenote (code, description) VALUES
    ('PB', 'Partly built nest. Should NOT be counted as an attempt in cumulative counts. Only entered in some years.');


-- -----------------------------------------------------------------------------
-- lookup_quality_flag
-- Uncertainty flags for reproductive count columns (eggs, hatch, band, fledge, indep, dfe).
-- -----------------------------------------------------------------------------
INSERT INTO lookup_quality_flag (code, description, meaning) VALUES
    ('.',  'No flag',          'Value is considered reliable. Default state.'),
    ('?',  'Uncertain',        'Observer could not confidently determine the count. Use with caution in analyses requiring high certainty.'),
    ('+',  'Minimum count',    'True value might be higher. E.g., nest not observed during complete laying, so egg count is a minimum.'),
    ('-',  'Possible overcount', 'True value might be lower. Rare — used when observer suspects count may include error.');

-- Historical compound codes (preserved for import compatibility):
INSERT INTO lookup_quality_flag (code, description, meaning) VALUES
    ('?+',   'Uncertain minimum count (historical)',              'Observer was uncertain but value is at least this high. Compound flag from historical data.'),
    ('?+++', 'Uncertain, likely well above minimum (historical)', 'Observer was uncertain but value is likely much higher. Compound flag from historical data.'),
    ('?-',   'Uncertain, possible overcount (historical)',        'Observer was uncertain and value may be too high. Compound flag from historical data.')
ON CONFLICT (code) DO NOTHING;
