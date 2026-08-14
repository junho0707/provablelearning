# cron-auto-unenroll — daily sweep of unpaid past-deadline enrollments

## Purpose

Cancels `active+unpaid` enrollments past `payment_deadline`. Frees the seat and dispatches waitlist auto-enroll.

## Schedule

`0 6 * * *` (daily 06:00 UTC), defined in `vercel.json`.

## Behavior

1. Find all enrollments where `status='active'`, `payment_status='unpaid'`, `payment_deadline IS NOT NULL`, `payment_deadline < today`.
2. For each: set `status='canceled'`; insert `admin_logs` action `auto_unenroll_unpaid`; insert a `notifications` row to parent or independent student; remove the student from each slot's Google Classroom; dispatch `dispatchWaitlistAutoEnroll` for each freed slot.

## Inputs / outputs / side effects

- **Input:** cron trigger; `Authorization: Bearer <CRON_SECRET>`.
- **Output:** JSON `{ unenrolled, errors }`.
- **Side effects:** updates `enrollments.status`, inserts `admin_logs` + `notifications`, removes from Classroom, may auto-enroll waitlisters.

## File paths

- `src/app/api/cron/auto-unenroll/route.ts`

## Journeys that use it

- [enroll](../journeys/enroll.md) — pay-later auto-unenroll transition.
- (end-enrollment, view-my-data when written)
