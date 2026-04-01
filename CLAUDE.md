# Mandarte Database App — Development Rules

## Before every commit

Run the QA script:
```bash
node .claude/skills/mandarte-qa/scripts/qa-check.js
```
Fix all errors. Review all warnings. Do not commit with unreviewed warnings.

## Commit discipline

- **One logical change per commit.** If the summary has "and", split it.
- **Use conventional format:** `type(scope): summary` + body explaining WHY
- Types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`
- Scopes: `nest-card`, `roster`, `scheduler`, `territory`, `schema`, `validation`
- Keep subject under 60 characters. Details go in the body.

## After any schema or migration change

Run the mandarte-discipline skill, which syncs:
1. `database/schema.sql` — regenerate from live DB
2. `docs/database_spec.md` — update affected table sections
3. `database/migrations/NNN_*.sql` — create numbered migration file

## Data protection rules (non-negotiable)

- Never overwrite historical field data — changes are new events, not edits
- Field app must never modify previous-season or proofed records
- Auto-populate only fills NULL fields — never overwrites existing values
- Nest parents come from breed.male_id/female_id, not current territory
- band_id values from DB are integers — always String() before .length or .test()

## Sex encoding

- `sex = 1` → female (♀)
- `sex = 2` → male (♂)
- `sex = 0` → unknown

## Band IDs

- 9 digits, numeric only
- Filter input: `e.target.value.replace(/\D/g, '').slice(0, 9)`
- Validate only NEW bands (not ones already in the DB)
- Check uniqueness against birds table before saving
