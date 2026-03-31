# Database

PostgreSQL schema, seed data, migrations, and import scripts for the Mandarte Island Song Sparrow database.

## Folder structure

```
database/
├── schema.sql          ← Full PostgreSQL table definitions (generated from docs/database_spec.md)
├── seed/               ← Lookup table data (failcodes, stagfind codes, experiment codes, etc.)
│   └── seed_lookups.sql
├── migrations/         ← Versioned schema changes (see migration log below)
└── import/             ← Scripts to load historical Excel data into the raw archive tables
```

## Usage

### Setting up from scratch

1. Create a Supabase project at https://supabase.com
2. Run `schema.sql` in the Supabase SQL editor to create all tables
3. Run seed scripts in `seed/` to populate lookup tables
4. Run migrations in order (see below)
5. Historical data import scripts in `import/` are run separately (and carefully)

### Making schema changes

Never edit `schema.sql` directly for an existing database. Instead:
1. Create a new numbered migration file in `migrations/`
2. Test the migration locally or in a development branch
3. Run it against the Supabase database via the SQL editor
4. Update `schema.sql` to reflect the current state (if desired)

## Migration log

All migrations live in `migrations/` and must be run in order. Each file is idempotent where possible (uses `IF NOT EXISTS`, `DROP ... IF EXISTS` before `CREATE`).

| # | File | Description | Status |
|---|------|-------------|--------|
| 001 | `migration_001_color_combos.sql` | Adds `color_combo` column to birds table, creates color band reference data | Run |
| 001 | `migration_001_field_app.sql` | Creates `territory_assignments`, `territory_visits`, `nest_visits` tables + RLS policies for field app | Run |
| 002 | `migration_002_rls_cleanup.sql` | Cleans up RLS policies — adds missing SELECT/INSERT policies for territory_visits, nest_visits, lookup tables | Run |
| 003 | `migration_003_nullable_immigrant.sql` | Makes `is_immigrant` nullable on birds table (field app leaves NULL; historical import fills it) | Run |
| 004 | `migration_004_rename_columns.sql` | Renames `fail_code` → `stage_fail`, `stage_find_code` → `stage_find` on breed table to match protocol terminology | Run |
| 005 | `migration_005_field_id.sql` | Adds `field_id` and `is_unbanded`/`unbanded_description` columns to birds table for tracking unbanded birds | Run |
| 006 | `migration_006_import_conflict_staging.sql` | Creates safe historical import system: `staging_birds`, `import_conflicts`, `import_log` tables. Adds `proofed` column to breed and survival with CHECK constraints | Run |
| 007 | `migration_007_schema_definitions.sql` | Self-documenting schema: COMMENT on every column in breed/survival/birds matching protocol. Adds `date_hatch`, `nest_height`, `vegetation`, `nest_description` to breed. Creates `lookup_quality_flag` table. Fixes survival proofed constraint | Run |
| 008 | `migration_008_data_protection.sql` | **CRITICAL**: PostgreSQL triggers that REJECT modification of proofed or previous-season records. Protects breed, survival, territory_assignments, territory_visits, birds, raw_survival, raw_breed. Raw tables are ALWAYS immutable. Admin override via `SET LOCAL "app.admin_override" = 'true'` | Run |
| 009 | `migration_009_rls_write_policies.sql` | Adds missing INSERT/UPDATE RLS policies for all tables the field app writes to (birds, territory_assignments, breed, survival, corrections, staging tables) | Run |

### Running migrations

In the Supabase SQL editor, paste and run each migration file in order. Most migrations are safe to re-run (idempotent), but always check the file header for notes.

### Admin override for protected records

Migration 008 installs database-level triggers that block modification of historical/proofed records. For legitimate corrections (Katherine only):

```sql
-- In Supabase SQL Editor:
SET LOCAL "app.admin_override" = 'true';
-- Make the specific correction
-- Log it in the corrections table with full justification
-- Override expires when the SQL session ends
```

## Important

- **Raw archive tables** (`raw_survival`, `raw_breed`) are ALWAYS immutable — even admin override cannot change them. They are exact mirrors of original data files.
- **The field app uses the anon key** with RLS enforced. All protection triggers run regardless of RLS.
- **Historical data import** uses the staging + conflict review system (migration 006). Never bulk-import directly into working tables.
- See the [database specification](../docs/database_spec.md) for details on the two-layer architecture.
