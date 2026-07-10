# waitlist-join — `joinWaitlist` and `joinSgWaitlist`

## Purpose

Inserts a `waitlist` row in `waiting` status. Two shapes exist depending on group size:

- **`joinWaitlist`** (LG, occasionally 1:1) — a single `class_id`.
- **`joinSgWaitlist`** (SG / 1:1 dual-slot) — a list of 2–4 `preferred_class_ids` and `class_id=NULL`.

## Behavior

- Both check for an existing `waiting`/`notified` row for the same student and reject duplicates (I-30 / I-31).
- `joinSgWaitlist` rejects fewer than 2 or more than 4 preferred slots (I-32).
- Both record `agreement_version` and `agreement_timestamp`.

## Inputs / outputs / side effects

- **Input:** `studentId`, (`classId` or `preferredClassIds[]`), `agreementVersion`, `agreementTimestamp`.
- **Output:** `{ waitlistId, error }`.
- **Side effect:** one row inserted into `waitlist`.

## File paths

- `src/lib/waitlist/join.ts`

## Journeys that use it

- [enroll](../journeys/enroll.md) — explicit "Join waitlist" form, and the SG/1:1 capacity-full fallback inside `enrollAction`.
