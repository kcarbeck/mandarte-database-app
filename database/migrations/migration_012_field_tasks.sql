-- Migration 012: Field tasks (manual to-do checklist)
-- Stores user-created tasks for field workers.
-- Auto-generated reminders (banding due, fledge checks, etc.) are computed live, not stored.

CREATE TABLE IF NOT EXISTS field_tasks (
    task_id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    title TEXT NOT NULL,
    notes TEXT,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    -- Optional link to a territory or nest
    territory TEXT,
    breed_id INTEGER REFERENCES breed(breed_id)
);

-- RLS
ALTER TABLE field_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can read field_tasks" ON field_tasks;
CREATE POLICY "Anon can read field_tasks"
    ON field_tasks FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can insert field_tasks" ON field_tasks;
CREATE POLICY "Anon can insert field_tasks"
    ON field_tasks FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update field_tasks" ON field_tasks;
CREATE POLICY "Anon can update field_tasks"
    ON field_tasks FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can delete field_tasks" ON field_tasks;
CREATE POLICY "Anon can delete field_tasks"
    ON field_tasks FOR DELETE TO anon USING (true);
