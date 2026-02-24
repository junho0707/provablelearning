# Waitlist Auto-Enrollment — First Come First Served

**Created:** 2026-02-22
**Status:** TODO
**Priority:** P0 — blocking Flow 5 QA

---

## Problem

When a student drops a class (or is refunded), the next waitlisted student is marked as `notified` but must **manually** visit `/enroll/waitlist-offer/<id>` to claim the seat. This is broken:
- No email/SMS notification exists yet, so the student never knows
- The 24-hour claim window expires silently
- Seat stays empty even though someone is waiting

## Desired Behavior

**Auto-enroll the next waitlisted student immediately when a seat opens.** No manual claim step. First come, first served (FIFO by `waitlist.created_at`).

## Flow

1. Seat opens (enrollment status → `canceled` or `refunded`)
2. System finds the **oldest** `waiting` entry in `waitlist` for that `class_id` (FIFO)
3. System **automatically enrolls** that student:
   - Call `reserve_seat` RPC for the waitlisted student
   - If student has matching credits → apply credits, activate enrollment
   - If no credits and Stripe disabled (test mode) → activate directly
   - If no credits and Stripe enabled → activate directly (waitlist students already committed to paying; charge later or send payment link)
4. Update waitlist entry: `status = 'converted'`
5. Log to `admin_logs`
6. If `reserve_seat` fails (e.g., student became ineligible) → skip to next waitlisted student

## Where to Implement

### Option A: Synchronous in `drop.ts` (Recommended for simplicity)
- In `src/lib/enrollment/drop.ts`, after successful `drop_enrollment` RPC
- In `src/app/(dashboard)/admin/refunds/actions.ts`, after refund processing
- Both already call `notifyNextOnWaitlist()` — replace with `autoEnrollNextOnWaitlist()`

### Option B: Via cron (More resilient)
- Modify `/api/cron/waitlist-notify` to auto-enroll instead of just notifying
- Trigger still queues to `waitlist_notify_queue`, cron picks up and enrolls

## New Function: `autoEnrollNextOnWaitlist(classId)`

Location: `src/lib/waitlist/auto-enroll.ts`

```typescript
export async function autoEnrollNextOnWaitlist(classId: string): Promise<void> {
  // 1. Get class details (course_id, group_size_type)
  // 2. Find next waitlist entry: status='waiting', ORDER BY created_at ASC, LIMIT 1
  // 3. Check eligibility (student may have enrolled elsewhere since joining waitlist)
  // 4. Call reserve_seat RPC with admin client
  // 5. Check/apply credits
  // 6. If no credits: activate directly (test mode) or create payment link (Stripe mode)
  // 7. Update waitlist status → 'converted'
  // 8. Log to admin_logs
  // 9. If any step fails → update waitlist status → 'skipped', recurse to try next student
}
```

## Files to Modify

- `src/lib/waitlist/auto-enroll.ts` — NEW: main auto-enroll logic
- `src/lib/enrollment/drop.ts` — replace `notifyNextOnWaitlist()` with `autoEnrollNextOnWaitlist()`
- `src/app/(dashboard)/admin/refunds/actions.ts` — same replacement
- `src/app/api/cron/waitlist-notify/route.ts` — same replacement (process queue items)
- `src/lib/waitlist/notify-next.ts` — can be deprecated or kept as fallback

## Waitlist Status Values After Change

- `waiting` — in queue
- `converted` — auto-enrolled successfully
- `skipped` — was next in line but failed eligibility/reserve (tried next student)
- `expired` — can be removed (no longer needed if auto-enrolling)
- `notified` — deprecated (no manual claim step)

## Edge Cases

- **Student no longer eligible** (enrolled in same course elsewhere, course started, etc.) → skip, try next
- **Class still full** (race condition, another enrollment snuck in) → stop, don't process further
- **No waitlist entries** → no-op
- **Credits available** → apply automatically
- **No credits, Stripe enabled** → activate enrollment directly; admin can invoice separately
- **Agreement fields** → use original agreement from when student joined waitlist (store on waitlist row), OR require a new agreement (simpler: just use a default agreement version)

## Agreement Problem

`reserve_seat` RPC requires `agreement_version` and `agreement_timestamp` NOT NULL. Options:
1. **Store agreement on waitlist join** — add `agreement_version` and `agreement_timestamp` columns to `waitlist` table, capture when student first joins waitlist
2. **Use system default** — pass a system agreement version like `'waitlist-auto-v1'` with `now()` timestamp
3. **Skip agreement check for auto-enroll** — create a separate `reserve_seat_waitlist` RPC that doesn't require agreement (student already agreed when they joined waitlist)

**Recommendation:** Option 1 — capture agreement at waitlist join time, reuse at auto-enroll time. Cleanest and most auditable.

## Migration Needed

```sql
-- Add agreement columns to waitlist table
ALTER TABLE public.waitlist
  ADD COLUMN agreement_version TEXT,
  ADD COLUMN agreement_timestamp TIMESTAMPTZ;
```

## Test Plan

1. Create class with capacity 2
2. Enroll Alice + Bob (full)
3. Charlie joins waitlist
4. Drop Bob → Charlie auto-enrolled, waitlist status = 'converted'
5. Verify Charlie appears on parent dashboard as active
6. Verify admin logs show auto-enrollment
7. Edge: Charlie became ineligible → next student in line gets enrolled
8. Edge: Multiple waitlist entries → only first gets enrolled per seat opening
