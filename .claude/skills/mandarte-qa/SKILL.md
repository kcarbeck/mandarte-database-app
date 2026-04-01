---
name: mandarte-qa
description: >
  Pre-commit quality assurance for the Mandarte field app. MUST trigger before ANY
  commit to the app/ directory. Also trigger when the user says "QA", "check", "review",
  "before we commit", "ready to push", "does this look right", or when you've just
  finished editing code and are about to commit. This skill catches the specific classes
  of bugs that have repeatedly bitten this project — type coercion, rendering logic,
  input validation, and documentation drift. Run it every time, no exceptions.
---

# Mandarte Pre-Commit QA

This skill exists because we keep hitting the same bugs. Rather than catching them after the fact, run these checks before every commit. The checks are organized by the actual failure modes we've seen.

## When to run

Before every commit that touches files in `app/src/`. No exceptions. Even "small" changes have broken things — a one-line conditional fix broke the entire roster rendering because of bracket logic.

## Automated checks

Run the QA script first — it catches the mechanical stuff:

```bash
node app/.claude/skills/mandarte-qa/scripts/qa-check.js
```

The script checks all `.js` files under `app/src/app/` for:

1. **Bracket balance** — every file must have matching `()`, `{}`, `[]`
2. **Syntax validation** — babel parse of every page file
3. **Band ID type safety** — flags `.length` on a value that might be a number (the #1 recurring bug)
4. **Sex encoding direction** — flags `sex === 1` near `♂` or `sex === 2` near `♀` (we swapped these once)
5. **Missing input minimums** — count inputs (egg_count, chick_count, etc.) without `min=` or `min={0}`
6. **Negative value risk** — number inputs that accept negative values for fields that should never be negative

Review any warnings. Not all are real bugs — but each one represents a class of mistake we've actually shipped.

## Manual checklist

After the script passes, mentally walk through these. They can't be automated because they're about logic, not syntax:

### Data protection (the non-negotiables)
- [ ] Does any new code write to `breed` or `birds` without checking `proofed` status?
- [ ] Does any update touch records from a previous year? (Must be blocked)
- [ ] Does any auto-populate logic overwrite non-NULL values? (Must only fill NULLs)
- [ ] Are nest parents coming from `breed.male_id`/`female_id`, not from current territory assignment?

### Type coercion (the repeat offender)
- [ ] Are band_id values converted to String before `.length`, `.test()`, or comparison?
- [ ] Are database integers (kid1-kid5, band_id) handled as potentially numeric when loaded?
- [ ] When filtering or comparing band IDs, is `.map(String)` applied?

### Conditional rendering (the subtle one)
- [ ] Does any ternary use `condition && (x ? a : b)` pattern? (When condition is false, falls through to nothing — but if wrapped in an outer ternary, false goes to the else branch, not nothing)
- [ ] Are filter-dependent sections properly wrapped so they don't leak into other filter states?
- [ ] Is the "empty state" message gated on the same filter as the content?

### Input validation
- [ ] Do new number inputs have `min={0}` where negative values are nonsensical?
- [ ] Do new band inputs filter to digits only (`e.target.value.replace(/\D/g, '').slice(0, 9)`)?
- [ ] Do new band inputs validate 9-digit format before save?
- [ ] Is uniqueness checked against the database for new band numbers?

### Schema and docs drift
- [ ] If you changed any database queries or table usage, does `database/schema.sql` still match the live DB?
- [ ] If you added/changed fields in the UI, does `docs/database_spec.md` reflect this?
- [ ] If you added a migration, is it numbered sequentially after the latest in `database/migrations/`?

## Commit message format

When the checks pass and you're ready to commit, use this format:

```
<type>(<scope>): <short summary under 60 chars>

<body — what changed and WHY, not just what files were touched>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`
Scopes: `nest-card`, `roster`, `scheduler`, `territory`, `schema`, `validation`

One logical change per commit. If you're about to write "and" in the summary, it's probably two commits.

## What to do when a check fails

Don't just suppress the warning. Each check exists because of a real bug that shipped:

- **Band type coercion**: Add `.map(String)` or `String(value)` at the point of use
- **Sex encoding swap**: Verify against birds/page.js — sex=1 is female (♀), sex=2 is male (♂)
- **Missing min=0**: Add `min={0}` to the input element
- **Bracket imbalance**: Don't try to fix by eye — use the script's line-by-line counter to find where the mismatch starts
- **Schema drift**: Run the mandarte-discipline skill to sync everything
