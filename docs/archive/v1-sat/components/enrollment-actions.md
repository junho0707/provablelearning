# enrollment-actions — server actions for enroll / waitlist / accept-offer

## Purpose

Wraps the enrollment business flow: ownership check → eligibility → `reserve_seat` → Stripe Checkout (or pay-later short-circuit) → Google Classroom side-effects. Owns three actions corresponding to the three entry points from [enroll-pages](enroll-pages.md).

## Actions

| Action | Form input | Outcome on success | Outcome on race / failure |
|---|---|---|---|
| `enrollAction` | `student_id`, `slot_1_class_id`, `slot_2_class_id?`, agreement, payment choice, subject category | Returns `{ redirectTo: stripeUrl }` (pay-now) or `{ redirectTo: '/enroll/success?...' }` (pay-later / test mode) | Returns `{ error }`. SG/1:1 capacity-full triggers fall-through to `joinSgWaitlist` and returns `{ waitlisted: true }`. |
| `joinWaitlistAction` | `student_id`, `class_id` (LG/1:1) **or** `preferred_class_ids` JSON (SG), agreement | Redirects to `/enroll?waitlisted=…` | Redirects to `/enroll?error=…`. |
| `acceptOfferAction` | `waitlist_id`, `slot_1_class_id`, `slot_2_class_id`, `student_start_date`, payment choice, subject | Returns `{ redirectTo: stripeUrl }` or success page | Reverts waitlist row to `waiting` (clearing `notified_at` + `offer_expires_at`); returns `{ error }`. |

## Inputs / outputs / side effects

- Reads: `students`, `classes`, `waitlist`, `enrollments`.
- Writes (admin client): inserts via `reserve_seat` RPC; updates `waitlist.status`, `enrollments.stripe_session_id`, `enrollments.classroom_joined`, `enrollments.status` (test mode); inserts `notifications`; calls `resolve_enrollment_makeup_conflicts` RPC; calls Google Classroom create/invite.
- External: Stripe Checkout creation; Google Classroom API.

## Notable branches

- `STRIPE_ENABLED=false`: skips Stripe, flips the row to `active` directly. Test mode only.
- Pay-later: `reserve_seat(p_pay_later=true)` returns `active+unpaid` immediately; Stripe is skipped.
- SG/1:1 capacity-full inside `enrollAction`: silently degrades to `joinSgWaitlist` so the user is not stuck.
- Per-student SG / 1:1 Classroom: created lazily on first enrollment if `classes.google_classroom_id` is null.
- Stripe Checkout creation failure: pending enrollment is deleted before returning the error.
- Stripe Checkout creation success but `update stripe_session_id` failure: pending enrollment is deleted.

## File paths

- `src/app/(dashboard)/enroll/[classId]/actions.ts` — `enrollAction`, `joinWaitlistAction`
- `src/app/(dashboard)/enroll/waitlist-offer/[waitlistId]/actions.ts` — `acceptOfferAction`

## Journeys that use it

- [enroll](../journeys/enroll.md)
