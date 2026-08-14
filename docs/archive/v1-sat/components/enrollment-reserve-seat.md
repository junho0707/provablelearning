# enrollment-reserve-seat — `reserve_seat` RPC

## Purpose

Atomically commits a student to one to three class slots. The single source of truth for `enrollments` row creation (I-2). Holds Postgres row locks across the capacity recheck and insert.

## Behavior

- **Locks** each chosen `classes` row with `FOR UPDATE`.
- Validates: agreement supplied (I-3); slot 1 active; LG cutoff (I-20); shared `group_size_type` (I-13); distinct classes (I-14); per-slot capacity recount inclusive of `slot_1`/`slot_2`/`slot_3`/`class_id` columns.
- Computes `student_start_date` and `student_end_date`:
  - LG: pulls from `classes.class_start_date` / `class_end_date`.
  - SG / 1:1: `student_start_date = COALESCE(p_student_start_date, CURRENT_DATE)`, `student_end_date = student_start_date + 35 days` (flat 5-week window since migration 00091; was "4th Saturday" before).
- Inserts the row:
  - `p_pay_later=true` → `status='active'`, `payment_status='unpaid'`, `payment_deadline = student_start_date + 7d` (I-11).
  - `p_pay_later=false` → `status='pending'`, `payment_status='paid'`. Activation happens via the Stripe webhook.
- Always sets `class_id := slot_1_class_id` (I-12).

## Inputs / outputs / side effects

- **Inputs:** `p_student_id`, `p_slot_1_class_id`, `p_slot_2_class_id?`, `p_agreement_version`, `p_agreement_timestamp`, `p_pay_later`, `p_student_start_date?`, `p_slot_3_class_id?`, `p_subject_category?`, `p_subject_detail?`, `p_slots_per_week=2`.
- **Output:** new `enrollments.id`.
- **Side effect:** inserts one `enrollments` row.
- **Raises:** "Slot N class not found / not active / full"; "Both slots must have the same group size type"; "Slot 1 and Slot 2 must be different classes"; "Large group class has already started — enrollment is closed"; "Agreement must be accepted before enrollment".

## File paths

- `src/lib/enrollment/reserve.ts` — TypeScript wrapper
- `supabase/migrations/00091_sg_fixes.sql` — current definition (latest)
- Earlier definitions: 00061, 00072, 00073, 00074, 00083, 00085, 00090

## Journeys that use it

- [enroll](../journeys/enroll.md) — direct enroll + waitlist offer accept
- (`auto_enroll_sg_from_waitlist` calls `reserve_seat` internally)
