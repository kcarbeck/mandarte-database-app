# Mandarte Database & Field App

Database infrastructure and field data collection app for the Mandarte Island Song Sparrow long-term population study (1975–present). Mandarte Island is located within the territory of the W̱SÁNEĆ peoples.

## What is this?

This project modernizes 50 years of breeding and survival data from Excel spreadsheets into a proper relational database, and builds a mobile field app so students can log observations in real time instead of transcribing paper records at end of season.

**Database:** PostgreSQL (hosted on Supabase) with a two-layer architecture — an immutable archive of raw data that can never be overwritten, and a working layer with validated, queryable tables. Includes a lightweight web UI for browsing and data entry without SQL knowledge.

**Field App:** A mobile web app for field students to log territory visits, nest observations, and chick tracking. Generates task lists from protocol rules, flags overdue visits, and gives the supervisor remote visibility into field operations.

## Project structure

```
mandarte-database-app/
├── README.md               ← You are here
├── docs/                   ← Specifications and reference documentation
│   ├── database_spec.md    ← Complete database schema and design
│   ├── field_app_prd.md    ← Field app product requirements
│   └── reference_*         ← Historical data documentation
├── database/               ← Database schema and data management
│   ├── schema.sql          ← PostgreSQL table definitions
│   ├── seed/               ← Lookup table seed data
│   ├── migrations/         ← Versioned schema changes
│   └── import/             ← Scripts to load historical Excel data
├── app/                    ← Field data collection web app
├── ui/                     ← Database browser / admin UI
└── exports/                ← Scripts to export data to CSV/Excel for R
```

## Documentation

| Document | Description |
|----------|-------------|
| [Database Specification](docs/database_spec.md) | Complete schema — all tables, columns, validation rules, lookup tables, and field app integration |
| [Field App PRD](docs/field_app_prd.md) | Product requirements for the mobile field data collection app |
| [Breedfile Column Reference](docs/reference_breedfile_columns.md) | Column-by-column documentation of the historical breedfile |

## Database overview

Five working tables:

| Table | Description | Source |
|-------|-------------|--------|
| `birds` | Master roster — one row per individual ever identified | Both files |
| `survival` | One row per bird per year alive (mirrors survival file) | Survival file + field app |
| `breed` | One row per nest attempt (mirrors breedfile) | Breedfile + field app |
| `territory_visits` | Territory visit log from field app | Field app (new) |
| `nest_visits` | Nest observation log from field app | Field app (new) |

Plus: lookup tables for coded fields (failcodes, stage of find, experiment codes), an immutable raw archive of the original Excel data, and a corrections audit trail.

See [database_spec.md](docs/database_spec.md) for the complete schema.

## Tech stack

- **Database:** PostgreSQL via [Supabase](https://supabase.com) (free tier)
- **Field App:** Next.js 14 mobile-first web app (hosted on Vercel)
- **Admin UI:** TBD (lightweight database browser)
- **Data analysis:** R (via `RPostgres` / `DBI`) or CSV/Excel export

## Status

🟢 **Field app launching for 2026 season.** Database is live on Supabase. Field app is built and undergoing final QA. Historical data migration will follow after end-of-season proofing.

## Data safety

The original Excel breedfile and survival file are **not** stored in this repository. They remain in their current location and will only be imported into the database after the schema is fully tested. The raw archive layer preserves every original value exactly as it appeared in the Excel files, and no data in the archive can ever be modified or deleted.

## Contributing

This project is maintained by Katherine Carbeck (kcarbeck). If you're a collaborator on the Mandarte study and want access to the database, contact Katherine.
