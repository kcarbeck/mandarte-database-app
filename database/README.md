# Database

PostgreSQL schema, seed data, migrations, and import scripts.

## Folder structure

```
database/
├── schema.sql          ← Full PostgreSQL table definitions (generated from docs/database_spec.md)
├── seed/               ← Lookup table data (failcodes, stagfind codes, experiment codes, etc.)
├── migrations/         ← Versioned schema changes (numbered: 001_initial.sql, 002_add_column.sql, etc.)
└── import/             ← Scripts to load historical Excel data into the raw archive tables
```

## Usage

### Setting up from scratch

1. Create a Supabase project at https://supabase.com
2. Run `schema.sql` in the Supabase SQL editor to create all tables
3. Run seed scripts in `seed/` to populate lookup tables
4. Historical data import scripts in `import/` are run separately (and carefully)

### Making schema changes

Never edit `schema.sql` directly for an existing database. Instead:
1. Create a new numbered migration file in `migrations/`
2. Test the migration locally
3. Run it against the Supabase database
4. Update `schema.sql` to reflect the current state

## Important

The `import/` scripts load historical data into the raw archive layer. This is a one-time operation that should only be run after thorough testing. See the [database specification](../docs/database_spec.md) for details on the two-layer architecture.
