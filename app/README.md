# Field Data Collection App

Mobile web app for Mandarte Island field students to log territory visits, nest observations, and chick tracking in real time.

## Status

🔴 **Not yet started.** See [field_app_prd.md](../docs/field_app_prd.md) for the product requirements.

## Overview

The app serves two primary functions:

1. **Task scheduler:** Auto-generates daily task lists from protocol rules (banding windows, fledge checks, visit schedules) and flags overdue items.
2. **Data capture:** Structured forms for territory visits and nest card observations, replacing end-of-season transcription from paper records.

Students interact with the app on their phones. The supervisor (Katherine) monitors compliance and reviews data remotely.

## Tech stack

TBD — will be decided during implementation. Requirements:
- Mobile-first web app (works on Safari iOS + Chrome Android)
- Connects to Supabase PostgreSQL database via REST API
- Simple, maintainable codebase (future maintainers are biologists, not software developers)
