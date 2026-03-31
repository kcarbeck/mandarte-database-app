# Archived Migrations

These migration files document schema changes that were applied to the live Supabase database between March–April 2026. They are kept for historical reference only.

**Do NOT re-run these.** The canonical schema is `database/schema.sql`.

| # | File | Description |
|---|------|-------------|
| 001 | migration_001_color_combos.sql | Adds color_combo to birds |
| 001 | migration_001_field_app.sql | Creates territory_assignments, territory_visits, nest_visits + RLS |
| 002 | migration_002_rls_cleanup.sql | Adds missing RLS policies |
| 003 | migration_003_nullable_immigrant.sql | Makes is_immigrant nullable |
| 004 | migration_004_rename_columns.sql | Renames breed columns to match protocol |
| 005 | migration_005_field_id.sql | Adds field_id, is_unbanded to birds |
| 006 | migration_006_import_conflict_staging.sql | Creates staging/import system + proofed column |
| 007 | migration_007_schema_definitions.sql | Schema comments, quality flags, date_hatch |
| 008 | migration_008_data_protection.sql | Protection triggers for proofed/historical records |
| 009 | migration_009_rls_write_policies.sql | Write RLS policies for field app |
| 010 | migration_010_nest_visits_breed_id.sql | Adds breed_id to nest_visits |
| 011 | migration_011_rls_anon_policies.sql | Anon RLS policies |
| 012 | migration_012_field_tasks.sql | Creates field_tasks table |
| 013 | migration_013_planned_actions.sql | Creates planned_actions table |
| 014 | migration_014_audit_fixes.sql | Schema audit: BIGINT field_id, role default, proofed check, lookup FKs, banding_records |
