-- Migration 013: Planned actions for field schedule ledger
-- Allows users to pin planned visits/tasks to specific dates on the ledger
-- Tap a cell to plan, tap again to remove — for weekly field schedule planning

CREATE TABLE IF NOT EXISTS planned_actions (
  action_id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  territory TEXT NOT NULL,
  planned_date DATE NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'visit',
  -- action_type values: 'visit', 'band', 'fledge_check', 'indep_check', 'renest_check', 'custom'
  breed_id INTEGER REFERENCES breed(breed_id) ON DELETE SET NULL,
  notes TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One planned action per territory+date+type+nest
  CONSTRAINT unique_planned_action UNIQUE (territory, planned_date, action_type, breed_id)
);

CREATE INDEX IF NOT EXISTS idx_planned_actions_year ON planned_actions(year);
CREATE INDEX IF NOT EXISTS idx_planned_actions_date ON planned_actions(planned_date);
CREATE INDEX IF NOT EXISTS idx_planned_actions_territory ON planned_actions(territory);

-- RLS: anon full access (field app)
ALTER TABLE planned_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_planned_actions" ON planned_actions
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_planned_actions" ON planned_actions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_planned_actions" ON planned_actions
  FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_delete_planned_actions" ON planned_actions
  FOR DELETE TO anon USING (true);
