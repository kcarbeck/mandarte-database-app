-- Migration 018: Link nest_visits to territory_visits via FK
--
-- Problem: nest observations created from the territory visit form had no direct
-- link back to the territory visit. The nest card page had to infer the connection
-- by matching date/time/observer, which was fragile and broke when visits were edited.
--
-- Solution: Add territory_visit_id FK to nest_visits. The territory page captures
-- the returned visit_id after inserting a territory_visit and passes it to each
-- nest_visit insert. The nest card page joins on this FK to display territory notes.
--
-- Also adds missing DELETE protection trigger on territory_visits (every other table
-- already had both UPDATE and DELETE triggers).

-- 1. Add FK column
ALTER TABLE nest_visits
  ADD COLUMN territory_visit_id BIGINT REFERENCES territory_visits(visit_id);

-- 2. Partial index for efficient joins
CREATE INDEX idx_nest_visits_territory_visit_id
  ON nest_visits(territory_visit_id)
  WHERE territory_visit_id IS NOT NULL;

-- 3. Backfill existing data by matching date + time + observer + territory
UPDATE nest_visits nv
SET territory_visit_id = tv.visit_id
FROM territory_visits tv
JOIN breed b ON b.territory = tv.territory AND b.year = tv.year
WHERE nv.breed_id = b.breed_id
  AND nv.visit_date = tv.visit_date
  AND nv.visit_time = tv.visit_time
  AND nv.observer = tv.observer
  AND nv.territory_visit_id IS NULL;

-- 4. Add missing DELETE protection trigger on territory_visits
CREATE OR REPLACE FUNCTION protect_territory_visits_delete()
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
    IF OLD.year IS NOT NULL AND OLD.year < active_season THEN
        RAISE EXCEPTION 'BLOCKED: Cannot delete territory visit from year % (visit_id=%). Historical records cannot be deleted through the field app.',
            OLD.year, OLD.visit_id;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_territory_visits_on_delete
    BEFORE DELETE ON territory_visits
    FOR EACH ROW
    EXECUTE FUNCTION protect_territory_visits_delete();
