---
name: mandarte-discipline
description: >
  Enforces schema sync, documentation updates, and git discipline for the Mandarte
  database app. MUST trigger: (1) after ANY database migration or schema change,
  (2) when the user says "done", "wrap up", "let's commit", "push", or ends a session,
  (3) after completing a feature or bug fix. This skill keeps schema.sql, database_spec.md,
  migration files, and git history in sync. If you just finished editing code and are about
  to commit, trigger this skill alongside mandarte-qa.
---

# Mandarte Discipline

This skill exists because schema.sql, database_spec.md, and the live database have drifted out of sync multiple times. The fix is simple: run the sync steps every time, not "later."

## After any database migration or schema change

Do all four of these, in order:

### 1. Regenerate `database/schema.sql`

Query the live Supabase database for the current schema and overwrite `database/schema.sql`. Use the Supabase MCP `execute_sql` tool to pull DDL. This file is the source of truth — never hand-edit it, always regenerate.

```sql
-- Pull table definitions, indexes, constraints, triggers
-- for all tables in the public schema
```

### 2. Update `docs/database_spec.md`

Review what changed and update the relevant table sections. This document is human-readable documentation, not a SQL dump. Explain what fields mean in the context of the Mandarte study (e.g., "breed.band = number of chicks reaching banding age at day 6, not number physically banded").

### 3. Create a numbered migration file

Check `database/migrations/` for the latest sequence number. Create the next one:
- Filename: `NNN_description_of_change.sql`
- Include a comment at the top explaining WHY the change was made
- Contains the DDL that was applied (CREATE, ALTER, etc.)
- Once committed, migration files are **immutable** — if you made a mistake, create a new migration to fix it

### 4. Update `database/seed_lookups.sql` if lookup data changed

If any reference tables (species lists, status codes, etc.) were modified, update the seed file so new database instances get the right data.

## Before ending a work session

When the user says they're done, wrapping up, or wants to commit:

### 1. Run the QA script

```bash
node .claude/skills/mandarte-qa/scripts/qa-check.js
```

Fix all errors. Review all warnings. Do not proceed with unreviewed warnings.

### 2. Check for uncommitted drift

Run `git status` and `git diff --stat`. Flag:
- App code changed but schema.sql not updated
- Schema changed but no migration file created
- database_spec.md not updated after table changes

### 3. Commit with discipline

One logical change per commit. If the summary needs "and", split it into two commits.

Format:
```
type(scope): summary under 60 chars

Body explaining WHY this change was made, not just what files were touched.
Reference the feature, bug, or audit item that motivated this.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`
Scopes: `nest-card`, `roster`, `scheduler`, `territory`, `schema`, `validation`

### 4. Push and confirm

After committing, push to origin and confirm the push succeeded.

## Data protection reminders

These are non-negotiable and should be verified during any schema change:

- Never overwrite historical field data — changes are new events, not edits
- Field app must never modify previous-season or proofed records
- Database triggers enforce proofing locks — don't bypass them
- Nest parents come from `breed.male_id`/`female_id`, not current territory assignment
- `band_id` values from DB are integers — always `String()` before `.length` or `.test()`
- Field app leaves `is_immigrant` NULL; historical imports fill NULLs

## Files this skill manages

| File | Role | Update when |
|------|------|-------------|
| `database/schema.sql` | DDL source of truth | Any schema change — regenerate from live DB |
| `docs/database_spec.md` | Human-readable schema docs | Table structure or field meaning changes |
| `database/migrations/NNN_*.sql` | Sequential change history | Any DDL applied to the database |
| `database/seed_lookups.sql` | Reference/lookup data | Lookup tables modified |
