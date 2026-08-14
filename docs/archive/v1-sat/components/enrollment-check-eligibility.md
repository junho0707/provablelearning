# enrollment-check-eligibility — pre-flight validation

## Purpose

Validates an enrollment attempt before `reserve_seat` is called. Catches conflicts that would otherwise raise inside the RPC and enables friendly UI errors.

## Checks (in order)

1. Slot 1 class exists and is fetched.
2. **LG cutoff** (I-20): for `group_size_type='large'`, fail if `class_start_date <= today`.
3. **Duplicate enrollment** (I-16): student must not have any `pending`/`active` enrollment whose `class_id`/`slot_1_class_id`/`slot_2_class_id`/`slot_3_class_id` equals the slot-1 class.
4. **Phase 2 drop block** (I-25): student must not have a row with `class_blocked=true` whose slot fields match the slot-1 class.
5. **Time conflict** (I-17): collects all `(meeting_day, meeting_time)` pairs from the student's pending/active enrollments (across all slot columns) and rejects on any match.
6. Slot 2: must exist, share `group_size_type`, be on a different `meeting_day` (I-15), not duplicate an existing enrollment, not conflict.
7. Slot 3: same checks as slot 2.

## Inputs / outputs / side effects

- **Input:** `studentId`, `slot1ClassId`, `slot2ClassId?`, `slot3ClassId?`, optional `{ skipCapCheck }`.
- **Output:** `{ eligible: boolean; reason?: string }`.
- **Side effects:** read-only.

## File paths

- `src/lib/enrollment/check-eligibility.ts`

## Journeys that use it

- [enroll](../journeys/enroll.md) — direct enrollment + LG waitlist join (SG waitlist join skips eligibility because slots are not yet committed).
