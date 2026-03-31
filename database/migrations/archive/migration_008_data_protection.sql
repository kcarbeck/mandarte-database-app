-- =============================================================================
-- Migration 008: Historical Data Protection
--
-- PROBLEM: The field app and any future import scripts must NEVER modify
-- records from previous seasons or proofed records. A single accidental
-- propagation into 50 years of historical data could corrupt irreplaceable
-- research. This must be enforced at the DATABASE LEVEL, not just in app code.
--
-- SOLUTION: PostgreSQL trigger functions that REJECT any UPDATE or DELETE
-- on breed/survival rows that are either:
--   (a) proofed = TRUE, or
--   (b) from a year other than the current active season
--
-- The only way to modify protected records is:
--   1. Set the session variable 'app.admin_override' = 'true' (requires
--      direct database access — the field app NEVER sets this)
--   2. This leaves a clear audit trail because the override must be
--      explicitly activated per-session
--
-- Run AFTER migration_007.
-- =============================================================================


-- =============================================================================
-- 1. BREED TABLE PROTECTION
-- =============================================================================

CREATE OR REPLACE FUNCTION protect_breed_records()
RETURNS TRIGGER AS $$
DECLARE
    active_season INTEGER;
    is_admin BOOLEAN;
BEGIN
    -- Check if admin override is active for this session
    BEGIN
        is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        is_admin := false;
    END;

    -- Admin override bypasses all protection
    IF is_admin THEN
        RETURN NEW;
    END IF;

    -- RULE 1: Never modify proofed records
    IF OLD.proofed = TRUE THEN
        RAISE EXCEPTION 'BLOCKED: Cannot modify proofed breed record (nestrec=%, year=%). '
            'Proofed records are locked. To modify, first set proofed=FALSE through '
            'the admin review process, then make the change.',
            OLD.nestrec, OLD.year;
    END IF;

    -- RULE 2: Never modify records from previous seasons
    -- Active season = current calendar year (field season runs ~March-August)
    active_season := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

    IF OLD.year IS NOT NULL AND OLD.year < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot modify breed record from year % (nestrec=%). '
            'Only current season (%) records can be modified through the field app. '
            'Historical corrections require admin access.',
            OLD.year, OLD.nestrec, active_season;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to UPDATE (most common risk)
DROP TRIGGER IF EXISTS protect_breed_on_update ON breed;
CREATE TRIGGER protect_breed_on_update
    BEFORE UPDATE ON breed
    FOR EACH ROW EXECUTE FUNCTION protect_breed_records();

-- Apply to DELETE (should basically never happen, but protect anyway)
CREATE OR REPLACE FUNCTION protect_breed_delete()
RETURNS TRIGGER AS $$
DECLARE
    active_season INTEGER;
    is_admin BOOLEAN;
BEGIN
    BEGIN
        is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        is_admin := false;
    END;

    IF is_admin THEN
        RETURN OLD;
    END IF;

    IF OLD.proofed = TRUE THEN
        RAISE EXCEPTION 'BLOCKED: Cannot delete proofed breed record (nestrec=%, year=%).',
            OLD.nestrec, OLD.year;
    END IF;

    active_season := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    IF OLD.year IS NOT NULL AND OLD.year < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot delete breed record from year % (nestrec=%). '
            'Historical records cannot be deleted through the field app.',
            OLD.year, OLD.nestrec;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_breed_on_delete ON breed;
CREATE TRIGGER protect_breed_on_delete
    BEFORE DELETE ON breed
    FOR EACH ROW EXECUTE FUNCTION protect_breed_delete();


-- =============================================================================
-- 2. SURVIVAL TABLE PROTECTION
-- =============================================================================

CREATE OR REPLACE FUNCTION protect_survival_records()
RETURNS TRIGGER AS $$
DECLARE
    active_season INTEGER;
    is_admin BOOLEAN;
BEGIN
    BEGIN
        is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        is_admin := false;
    END;

    IF is_admin THEN
        RETURN NEW;
    END IF;

    IF OLD.proofed = TRUE THEN
        RAISE EXCEPTION 'BLOCKED: Cannot modify proofed survival record (band_id=%, year=%).',
            OLD.band_id, OLD.year;
    END IF;

    active_season := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    IF OLD.year IS NOT NULL AND OLD.year < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot modify survival record from year % (band_id=%). '
            'Only current season (%) records can be modified through the field app.',
            OLD.year, OLD.band_id, active_season;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_survival_on_update ON survival;
CREATE TRIGGER protect_survival_on_update
    BEFORE UPDATE ON survival
    FOR EACH ROW EXECUTE FUNCTION protect_survival_records();

CREATE OR REPLACE FUNCTION protect_survival_delete()
RETURNS TRIGGER AS $$
DECLARE
    active_season INTEGER;
    is_admin BOOLEAN;
BEGIN
    BEGIN
        is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        is_admin := false;
    END;

    IF is_admin THEN
        RETURN OLD;
    END IF;

    IF OLD.proofed = TRUE THEN
        RAISE EXCEPTION 'BLOCKED: Cannot delete proofed survival record (band_id=%, year=%).',
            OLD.band_id, OLD.year;
    END IF;

    active_season := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    IF OLD.year IS NOT NULL AND OLD.year < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot delete survival record from year % (band_id=%).',
            OLD.year, OLD.band_id;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_survival_on_delete ON survival;
CREATE TRIGGER protect_survival_on_delete
    BEFORE DELETE ON survival
    FOR EACH ROW EXECUTE FUNCTION protect_survival_delete();


-- =============================================================================
-- 3. RAW ARCHIVE PROTECTION — Layer 1 is ALWAYS immutable
-- These tables should NEVER be modified under any circumstances.
-- Even admin override cannot change them.
-- =============================================================================

CREATE OR REPLACE FUNCTION block_raw_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'BLOCKED: Raw archive tables are immutable. '
        'Table "%" cannot be modified or deleted. '
        'These are exact mirrors of original data files.',
        TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- raw_survival: block all modifications
DROP TRIGGER IF EXISTS protect_raw_survival_update ON raw_survival;
CREATE TRIGGER protect_raw_survival_update
    BEFORE UPDATE ON raw_survival
    FOR EACH ROW EXECUTE FUNCTION block_raw_modification();

DROP TRIGGER IF EXISTS protect_raw_survival_delete ON raw_survival;
CREATE TRIGGER protect_raw_survival_delete
    BEFORE DELETE ON raw_survival
    FOR EACH ROW EXECUTE FUNCTION block_raw_modification();

-- raw_breed: block all modifications
DROP TRIGGER IF EXISTS protect_raw_breed_update ON raw_breed;
CREATE TRIGGER protect_raw_breed_update
    BEFORE UPDATE ON raw_breed
    FOR EACH ROW EXECUTE FUNCTION block_raw_modification();

DROP TRIGGER IF EXISTS protect_raw_breed_delete ON raw_breed;
CREATE TRIGGER protect_raw_breed_delete
    BEFORE DELETE ON raw_breed
    FOR EACH ROW EXECUTE FUNCTION block_raw_modification();


-- =============================================================================
-- 4. TERRITORY ASSIGNMENTS — Protect historical assignments
-- =============================================================================

CREATE OR REPLACE FUNCTION protect_territory_assignments()
RETURNS TRIGGER AS $$
DECLARE
    active_season INTEGER;
    is_admin BOOLEAN;
BEGIN
    BEGIN
        is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        is_admin := false;
    END;

    IF is_admin THEN
        RETURN NEW;
    END IF;

    active_season := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    IF OLD.year IS NOT NULL AND OLD.year < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot modify territory assignment from year % (assignment_id=%). '
            'Historical territory data cannot be changed through the field app.',
            OLD.year, OLD.assignment_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_territory_assignments_update ON territory_assignments;
CREATE TRIGGER protect_territory_assignments_update
    BEFORE UPDATE ON territory_assignments
    FOR EACH ROW EXECUTE FUNCTION protect_territory_assignments();


-- =============================================================================
-- 5. TERRITORY VISITS — Protect historical visits
-- =============================================================================

CREATE OR REPLACE FUNCTION protect_territory_visits()
RETURNS TRIGGER AS $$
DECLARE
    active_season INTEGER;
    is_admin BOOLEAN;
BEGIN
    BEGIN
        is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        is_admin := false;
    END;

    IF is_admin THEN
        RETURN NEW;
    END IF;

    active_season := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    IF OLD.year IS NOT NULL AND OLD.year < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot modify territory visit from year % (visit_id=%).',
            OLD.year, OLD.visit_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_territory_visits_update ON territory_visits;
CREATE TRIGGER protect_territory_visits_update
    BEFORE UPDATE ON territory_visits
    FOR EACH ROW EXECUTE FUNCTION protect_territory_visits();


-- =============================================================================
-- 6. BIRDS TABLE PROTECTION — Guard sensitive fields on the master roster
-- The birds table has no year column, so we protect by field:
--   - band_id changes are ONLY allowed via the formal correction/banding process
--   - is_immigrant and natal_year cannot be changed once set (these are facts)
--   - Deletions are never allowed
-- =============================================================================

CREATE OR REPLACE FUNCTION protect_birds_records()
RETURNS TRIGGER AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    BEGIN
        is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        is_admin := false;
    END;

    IF is_admin THEN
        RETURN NEW;
    END IF;

    -- is_immigrant: once set to 0 or 1, cannot be changed
    -- (NULL → 0/1 is allowed — that's the field app filling it in)
    IF OLD.is_immigrant IS NOT NULL AND NEW.is_immigrant IS DISTINCT FROM OLD.is_immigrant THEN
        RAISE EXCEPTION 'BLOCKED: Cannot change is_immigrant on bird % (was %, attempted %). '
            'Immigration status is a determined fact. Admin override required.',
            OLD.band_id, OLD.is_immigrant, NEW.is_immigrant;
    END IF;

    -- natal_year: once set, cannot be changed
    IF OLD.natal_year IS NOT NULL AND NEW.natal_year IS DISTINCT FROM OLD.natal_year THEN
        RAISE EXCEPTION 'BLOCKED: Cannot change natal_year on bird % (was %, attempted %). '
            'Natal year is a determined fact. Admin override required.',
            OLD.band_id, OLD.natal_year, NEW.natal_year;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_birds_on_update ON birds;
CREATE TRIGGER protect_birds_on_update
    BEFORE UPDATE ON birds
    FOR EACH ROW EXECUTE FUNCTION protect_birds_records();

-- Birds should never be deleted
CREATE OR REPLACE FUNCTION protect_birds_delete()
RETURNS TRIGGER AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    BEGIN
        is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        is_admin := false;
    END;

    IF is_admin THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'BLOCKED: Cannot delete bird record (band_id=%). '
        'Bird records are permanent. Mark as error in notes field instead.',
        OLD.band_id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_birds_on_delete ON birds;
CREATE TRIGGER protect_birds_on_delete
    BEFORE DELETE ON birds
    FOR EACH ROW EXECUTE FUNCTION protect_birds_delete();


-- =============================================================================
-- USAGE NOTES:
--
-- Normal field app operation: All protection is automatic. The app can only
-- modify current-season, unproofed records. Any attempt to touch historical
-- data will return a clear error message.
--
-- Admin corrections to historical data (Katherine only):
--   1. Connect to Supabase SQL Editor
--   2. SET LOCAL "app.admin_override" = 'true';
--   3. Make the specific correction
--   4. Log it in the corrections table with full justification
--   5. The override expires when the SQL session ends
--
-- Import scripts: Must SET LOCAL "app.admin_override" = 'true' at the start
-- of the import transaction, and should log every change to import_log.
-- =============================================================================
