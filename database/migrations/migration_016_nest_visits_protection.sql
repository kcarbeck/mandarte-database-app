-- ============================================================
-- Migration 016: nest_visits protection trigger + non-negative CHECK constraints
-- Applied: 2026-04-01
--
-- WHY: nest_visits was the only visit table without protection triggers,
-- meaning previous-season records could be accidentally modified or deleted.
-- Also adds CHECK constraints so the DB rejects negative counts (the UI
-- already has min=0 but defense-in-depth matters).
-- ============================================================

-- === 1. Protection trigger for UPDATE ===
CREATE OR REPLACE FUNCTION protect_nest_visits()
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
    IF OLD.visit_date IS NOT NULL AND EXTRACT(YEAR FROM OLD.visit_date)::INTEGER < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot modify nest visit from % (nest_visit_id=%).',
            EXTRACT(YEAR FROM OLD.visit_date)::INTEGER, OLD.nest_visit_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_nest_visits_on_update
    BEFORE UPDATE ON nest_visits
    FOR EACH ROW EXECUTE FUNCTION protect_nest_visits();

-- === 2. Protection trigger for DELETE ===
CREATE OR REPLACE FUNCTION protect_nest_visits_delete()
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

    active_season := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    IF OLD.visit_date IS NOT NULL AND EXTRACT(YEAR FROM OLD.visit_date)::INTEGER < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot delete nest visit from % (nest_visit_id=%). Historical records cannot be deleted through the field app.',
            EXTRACT(YEAR FROM OLD.visit_date)::INTEGER, OLD.nest_visit_id;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_nest_visits_on_delete
    BEFORE DELETE ON nest_visits
    FOR EACH ROW EXECUTE FUNCTION protect_nest_visits_delete();

-- === 3. CHECK constraints for non-negative counts ===
ALTER TABLE nest_visits ADD CONSTRAINT chk_egg_count_non_negative CHECK (egg_count >= 0);
ALTER TABLE nest_visits ADD CONSTRAINT chk_chick_count_non_negative CHECK (chick_count >= 0);
ALTER TABLE nest_visits ADD CONSTRAINT chk_cowbird_eggs_non_negative CHECK (cowbird_eggs >= 0);
ALTER TABLE nest_visits ADD CONSTRAINT chk_cowbird_chicks_non_negative CHECK (cowbird_chicks >= 0);

-- === Comments ===
COMMENT ON FUNCTION protect_nest_visits() IS
'Prevents modification of nest visit records from previous seasons. Admin override via SET app.admin_override = ''true''.';

COMMENT ON FUNCTION protect_nest_visits_delete() IS
'Prevents deletion of nest visit records from previous seasons. Admin override via SET app.admin_override = ''true''.';
