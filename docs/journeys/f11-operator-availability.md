# F11 — Operator: availability

**Actor:** Admin-Tutor · **Status:** 🟡 code-complete, not live-verified (`TASK-AVAIL-001`)

## Trigger

Operator manages when they're bookable.

## Steps

1. Edits a **recurring weekly template** (`availability_rules`: weekday, start/end time, active).
2. Adds one-off **blackouts** or **extra** slots (`availability_exceptions`).
3. Bookable slots are **derived** from rules minus blackouts plus extras, and **materialized in
   UTC** — display-timezone conversion (F8) is a rendering concern only, never stored.

## Why it matters structurally

This is a template + exceptions model, **not** a live read of an external calendar (e.g. Google
Calendar availability). The operator's own app is the source of truth for bookable time; Google
Calendar only receives the *event* once a booking is made (F8).

## Requirements / tests

`REQ-ADMIN-001..006` (availability-specific subset).

## Components

Not yet built.
