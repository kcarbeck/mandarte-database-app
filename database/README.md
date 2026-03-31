# Database

PostgreSQL schema and seed data for the Mandarte Island Song Sparrow database. Hosted on Supabase.

## Folder structure

```
database/
├── schema.sql              ← Canonical schema — the single source of truth for the current DB state
├── seed_lookups.sql        ← Lookup table seed data (failcodes, stagfind, experiments, quality flags, etc.)
├── migrations/
│   └── archive/            ← Historical migration files (already applied, kept for reference only)
└── import/                 ← Scripts to load historical Excel data into the raw archive tables
```

## Setting up from scratch

1. Create a Supabase project at https://supabase.com
2. Run `schema.sql` in the Supabase SQL editor — this creates all tables, constraints, triggers, functions, indexes, and RLS policies
3. Run `seed_lookups.sql` to populate lookup tables
4. Done. The schema is complete. Do NOT run the archived migration files.

## Schema changes going forward

All migrations are applied directly to the live Supabase DB (via MCP or SQL editor). After any change:

1. Update `schema.sql` to reflect the new state
2. Update `../docs/database_spec.md` if table structures changed
3. Update `seed_lookups.sql` if lookup data changed
4. Commit and push

The archived migration files in `migrations/archive/` document what was applied historically (migrations 001–014). They should never be re-run.

## Admin override for protected records

Database triggers block modification of historical/proofed records. For legitimate corrections (Katherine only):

```sql
-- In Supabase SQL Editor:
SET LOCAL "app.admin_override" = 'true';
-- Make the specific correction
-- Log it in the corrections table with full justification
-- Override expires when the SQL session ends
```

## Important

- **Raw archive tables** (`raw_survival`, `raw_breed`) are ALWAYS immutable — even admin override cannot change them.
- **The field app uses the anon key** with RLS enforced. All protection triggers run regardless of RLS.
- **Historical data import** uses the staging + conflict review system. Never bulk-import directly into working tables.
- See the [database specification](../docs/database_spec.md) for the full schema documentation.
