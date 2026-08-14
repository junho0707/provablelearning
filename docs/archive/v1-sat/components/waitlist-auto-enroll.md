# waitlist-auto-enroll — `dispatchWaitlistAutoEnroll`, `autoEnrollFromWaitlist`, `autoEnrollSgFromWaitlist`

## Purpose

Routes a "this class just freed a seat" event to either an immediate auto-enroll (LG) or a notify-then-accept flow (SG / 1:1).

## Behavior

### `dispatchWaitlistAutoEnroll(classId)`
- Reads `classes.group_size_type`.
- For LG: calls `autoEnrollFromWaitlist(classId)` (immediate auto-enroll). Returns `{ action: 'enrolled', data }` on success.
- For SG / 1:1: calls `notifySgWaitlistNext(classId)` (3-day offer). Returns `{ action: 'notified' }`.
- Returns `{ action: 'none' }` when nothing happens.

### `autoEnrollFromWaitlist` (LG)
- Calls the `auto_enroll_from_waitlist` RPC.
- The RPC: `FOR UPDATE` locks the class row; rechecks capacity; loops `waiting` entries with `FOR UPDATE SKIP LOCKED` (race-safe FIFO); skips rows with NULL agreement, dups, or time conflicts; inserts the new enrollment as `active+unpaid` with `payment_deadline = start + 7d`; sets the waitlist row to `converted`; logs `waitlist_auto_enrolled`.
- Then invites the auto-enrolled student to the LG Google Classroom (best-effort).

### `autoEnrollSgFromWaitlist` (SG / 1:1, used in some sweep paths)
- Calls the `auto_enroll_sg_from_waitlist` RPC, which picks two preferred slots that are open and on **distinct meeting days** (I-15, I-33), then calls `reserve_seat(p_pay_later=true)`. On success, it invites the student to both Google Classrooms.

## Inputs / outputs / side effects

- **Input:** `classId`.
- **Output:** `DispatchResult` for the dispatcher; `AutoEnrollResult | null` for the LG / SG functions.
- **Side effects:** inserts `enrollments`, updates `waitlist.status`, inserts `admin_logs`, sets `enrollments.classroom_joined`, calls Google Classroom API.

## Callers (transition triggers)

- `dropEnrollment` → both freed slot class IDs (synchronous belt-and-suspenders).
- `auto-unenroll` cron → freed slot class IDs.
- `cancel-makeup` (for makeup waitlist, distinct path: `autoBookMakeupFromWaitlist`).
- `handleCheckoutExpired` Stripe webhook → both freed slot class IDs.
- `waitlist-notify` cron → drains `waitlist_notify_queue` (filled by trigger `trg_queue_waitlist_notification`) and sweeps any `waiting` rows.

## File paths

- `src/lib/waitlist/auto-enroll.ts`
- `src/lib/waitlist/notify-sg-next.ts`
- `supabase/migrations/00091_sg_fixes.sql` (latest RPC definitions for both)

## Journeys that use it

- [enroll](../journeys/enroll.md) — LG seat-opens and SG seat-opens.
- (also touched by drop / Stripe expire / auto-unenroll / cancel-makeup; will be cross-linked when those journeys are written)
