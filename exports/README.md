# Data Export Scripts

Scripts to export database tables to CSV and Excel formats for use in R and other analysis tools.

## Status

🔴 **Not yet started.**

## Planned exports

- `survival.csv` — Mirrors the historical survival file format (with '.' for missing values, original column names) for backward compatibility with existing R scripts
- `breedfile.csv` — Mirrors the historical breedfile format for R compatibility
- `birds.csv` — Master bird roster (new, no historical equivalent)
- Custom filtered exports (e.g., "all breed records excluding feeding experiments")

## Design notes

These scripts read from the working-layer tables (not the raw archive) and produce files that are drop-in replacements for the current Excel files. This means existing R scripts (like gen_comp.R) can switch from reading Excel to reading these CSVs with minimal changes.
