# Journey — Enroll

A student gets onto a class. This is the most heavily exercised journey in the system: it's where money moves, capacity is committed, and the agreement is recorded.

## Actors & trigger

- **Actor:** Parent (enrolling a child) or independent Student (enrolling themselves).
- **Trigger:** User navigates to `/enroll` and chooses a class. Variants: open seat (direct enrollment), full class (waitlist join), waitlist offer (accept-after-notify).

## Participants

The journey's moving parts, with links into [../components/](../components/):

- [enroll-pages](../components/enroll-pages.md) — the `/enroll/*` page tree (browse, slot picker, success/cancel, waitlist offer)
- [enrollment-actions](../components/enrollment-actions.md) — server actions `enrollAction`, `joinWaitlistAction`, `acceptOfferAction`
- [enrollment-check-eligibility](../components/enrollment-check-eligibility.md) — pre-flight conflict / duplicate / phase-block check
- [enrollment-reserve-seat](../components/enrollment-reserve-seat.md) — `reserve_seat` RPC: atomic capacity check + insert
- [stripe-create-checkout](../components/stripe-create-checkout.md) — builds the Checkout Session
- [stripe-webhook-handlers](../components/stripe-webhook-handlers.md) — activates / frees the enrollment after Checkout returns
- [waitlist-join](../components/waitlist-join.md) — `joinWaitlist` (LG / 1:1) and `joinSgWaitlist` (SG, with preferred-slot list)
- [waitlist-notify-sg-next](../components/waitlist-notify-sg-next.md) — turns SG/1:1 `waiting` rows into `notified` with a 3-day offer window
- [waitlist-auto-enroll](../components/waitlist-auto-enroll.md) — LG immediate auto-enroll vs SG/1:1 notify-then-accept dispatcher
- [google-classroom](../components/google-classroom.md) — `createClassroomCourse` + `inviteStudentToClassroom`
- [cron-reconcile](../components/cron-reconcile.md) — Stripe ⇄ DB reconciliation safety net

## Sequence (high level — SG dual-slot pay-now)

```
Browser  ──── /enroll ────────────────────►  enroll-pages
                                                  │
                                                  ▼
                         (browse & pick) /enroll/[classId]   ◄── reads classes
                                                  │
                                                  ▼ enrollAction(formData)
                                          ┌─────────────────────────┐
                                          │ verifyStudentOwnership  │
                                          │ checkEligibility        │
                                          │ reserve_seat RPC        │ ── creates pending/paid row
                                          │ create Stripe Checkout  │
                                          │ store stripe_session_id │
                                          └─────────────────────────┘
                                                  │ redirect
                                                  ▼
                                              Stripe Checkout
                                                  │ pay
                                                  ▼
            ◄── /enroll/success?session_id  ──  Stripe redirects
                                                  │
                                                  ▼ asynchronous
                                          ┌─────────────────────────┐
                                          │ /api/webhooks/stripe    │
                                          │ checkout.session.       │
                                          │   completed             │
                                          └─────────────────────────┘
                                                  │
                                                  ▼
                              enrollment: pending → active, paid
                              Google Classroom invite (slot 1 + slot 2)
```

For pay-later, the row is inserted as `active+unpaid` directly (no Stripe round-trip) and Classroom invites fire from the server action. For waitlist, it's a notify-or-auto-enroll branch off the SG/1:1 vs LG split.

## Touched entities

| Entity | Lifecycle states traversed | Invariants enforced |
|---|---|---|
| `enrollments` | `(none)` → `pending`/`active` (paid or unpaid) | I-2, I-10–I-25 |
| `waitlist` | `(none)` → `waiting` → `notified` → `converted` | I-30–I-36 |
| `classes` | (read-only here, but capacity is row-locked during `reserve_seat`) | I-22 |
| `credits` | only relevant on Stripe expire (reverse_credits) | I-70 |

## Scenarios

### Direct enrollment — Small Group, dual-slot, pay now (canonical path)

- **Preconditions**
  - Authenticated Parent or independent Student.
  - Two SG `classes` rows exist, both `active=true`, on **different meeting days**, with capacity remaining.
  - Student does not have an active/pending enrollment that conflicts (slot overlap, time conflict, or `class_blocked` on the same class).
  - `STRIPE_ENABLED=true`.
- **Actions**
  1. User browses `/enroll`; the page builds capacity counts via the admin client (RLS would otherwise hide other students' rows — see invariant I-1) and shows seats remaining per class.
  2. User clicks an SG class card; routed to `/enroll/[classId]`. The page fetches both slot candidates (slot 1 = the clicked class) and renders `enroll-form.tsx` with a slot-2 picker, a subject-category selector, and an agreement checkbox.
  3. User selects slot 2, picks `subject_category` + optional `subject_detail`, picks `student_start_date`, accepts the agreement, and chooses **Pay now**.
  4. Form posts to `enrollAction`. Server action runs in order:
     - `verifyStudentOwnership` — guards against cross-family enrollment.
     - `checkEligibility` — verifies no conflicts, no duplicates, no `class_blocked`, slots-on-different-days for SG.
     - `reserveSeat` (`reserve_seat` RPC) — `FOR UPDATE` locks both class rows, re-checks capacity, inserts an `enrollments` row in `pending`/`paid` state with `slot_1_class_id`, `slot_2_class_id`, `subject_category`, `subject_detail`, `agreement_*`, `student_start_date`, and computed `student_end_date = start + 35d` (I-21).
     - Marks any matching SG `waitlist` rows for the same student as `converted`.
     - Calls `resolve_enrollment_makeup_conflicts` RPC: cancels any pre-booked makeups that collide with the new sessions and issues credits.
     - Creates a per-student Google Classroom for the slot-1 class if one doesn't exist; stores `google_classroom_id` on the class row.
     - Calls `createCheckoutSession` (Stripe). Stores `stripe_session_id` on the enrollment.
  5. Server action returns `{ redirectTo: session.url }`; the form redirects to Stripe.
  6. User pays. Stripe redirects to `/enroll/success?session_id=…`.
  7. Asynchronously, Stripe POSTs `checkout.session.completed` to `/api/webhooks/stripe`. The handler:
     - Updates the enrollment row matched on `(id, stripe_session_id)` from `pending → active`, `payment_status = 'paid'`, `payment_deadline = NULL`.
     - Invites the student email to the slot-1 and slot-2 Google Classrooms; sets `classroom_joined = true` on the enrollment if the invite landed.
- **Expected**
  - One `enrollments` row exists for the student in `active`/`paid` with both slots set, the agreement recorded, and `stripe_session_id` populated.
  - The student appears as enrolled on both class cards' seat counts.
  - The student is a member of both Google Classrooms (or has been emailed an invite).
  - The user lands on `/enroll/success` with confirmation copy.
- **Invariants checked**
  - **I-2**: enrollment created via `reserve_seat`, never direct INSERT.
  - **I-3**: `agreement_version` + `agreement_timestamp` recorded.
  - **I-12 / I-13 / I-14 / I-15**: slot canonicalization, group-size match, distinct classes, distinct days.
  - **I-16 / I-17**: no duplicate / time conflict.
  - **I-18 / I-19**: SG class `subject` is NULL; `subject_category` lives on the enrollment.
  - **I-21**: `student_end_date = student_start_date + 35d`.
  - **I-22**: capacity not exceeded (locked check).
  - **I-30**: waitlist row converted (if any).
  - **I-91** (lifecycle of payment): `pending → active` only via `checkout.session.completed`.

### Direct enrollment — Large Group (single-slot, pay now)

- **Preconditions**
  - LG class exists, `active=true`, with `class_start_date > today` (I-20) and capacity remaining.
  - Student does not have a conflicting enrollment.
- **Actions**
  - User picks the class on `/enroll`; routed to `/enroll/[classId]`.
  - LG enrollment is single-slot: form has no slot-2 picker, no subject-category selector (subject is on the class).
  - On submit, `enrollAction` runs `reserve_seat` with `slot_2_class_id = NULL` and `slots_per_week = NULL`. Start/end come from `class_start_date`/`class_end_date`, not the rolling formula.
  - Stripe checkout, then webhook activation; Google Classroom invite for the LG classroom (which is created at admin time, not at enrollment).
- **Expected**
  - Enrollment is single-slot; sessions number 4 or 8 depending on whether the LG class has a `meeting_day_2`.
- **Invariants checked**
  - **I-12** (`class_id == slot_1_class_id`).
  - **I-18** (LG class `subject` and `level` NOT NULL).
  - **I-20** (LG enrollment closes once class starts).

### Direct enrollment — 1:1 (dual-slot)

- **Preconditions**
  - Two 1:1 `classes` rows, different meeting days, capacity remaining.
- **Actions**
  - Same as SG, with `groupSizeType='one_on_one'`. The 1:1 Google Classroom is per-student and is created during the action (same path as SG).
  - Price is `PRICES.one_on_one` ($800/mo).
- **Expected**
  - Single enrollment with two slots; two 1:1 classrooms (one per slot if not pre-existing).
- **Invariants checked**
  - Same as the SG canonical scenario.

### Pay-later (deferred payment)

- **Preconditions**
  - All preconditions of the matching size variant.
  - User selects **Pay later** in the form.
- **Actions**
  - `enrollAction` calls `reserve_seat(p_pay_later=true)`. The row is inserted as `active`/`unpaid` with `payment_deadline = student_start_date + 7d`.
  - Stripe is not invoked. Google Classroom invites fire directly.
  - User lands on `/enroll/success?pay_later=true&deadline=YYYY-MM-DD`.
  - User can complete payment any time before the deadline by hitting "Pay now" on the dashboard, which calls `payNowAction` → builds a Stripe Checkout for the same enrollment, sets `stripe_session_id`. On success the webhook flips `payment_status` to `paid` and clears the deadline (I-11).
- **Expected**
  - Row is `active`/`unpaid` immediately; `payment_deadline` is set; the seat counts as committed in capacity totals.
- **Invariants checked**
  - **I-11**: deadline = start + 7 days.
  - **I-22**: capacity locked at `reserve_seat` time, not at pay time.

### Pay-later auto-unenroll (transition trigger, not a journey step)

- **Preconditions**
  - An `active`/`unpaid` enrollment exists with `payment_deadline < today`.
- **Actions**
  - The `auto-unenroll` cron (`0 6 * * *`, [cron-auto-unenroll](../components/cron-auto-unenroll.md)) sets the enrollment to `canceled`, logs `auto_unenroll_unpaid`, removes the student from Google Classrooms, and dispatches waitlist auto-enroll for each freed slot.
- **Expected**
  - Seat freed; next waitlister advances per the Waitlist scenarios below.
- **Invariants checked**
  - **I-11** (deadline drives transition).

### Stripe Checkout expires before payment

- **Preconditions**
  - Pay-now path completed `reserve_seat` and got a Stripe URL but the user closed the tab without paying. The Checkout Session has `expires_at = now + 30 min` (`PENDING_ENROLLMENT_TTL_MINUTES`).
- **Actions**
  - Stripe fires `checkout.session.expired`. `handleCheckoutExpired`:
    - If `pending`: deletes the enrollment, reverses any `credits_applied`, dispatches waitlist auto-enroll for both slot class IDs.
    - If `active+unpaid` (deferred-pay attempt): only clears `stripe_session_id`. The seat keeps its `active+unpaid` state and the original `payment_deadline`.
  - The `reconcile` cron is the safety net for missed `expired` events: any `pending` row older than 30 minutes whose Stripe session has `status='expired'` gets the same treatment.
- **Expected**
  - Pay-now `pending` rows do not linger past 30 minutes.
- **Invariants checked**
  - **I-10** (terminal states for pending).

### Direct enrollment — full class, SG → join SG waitlist

- **Preconditions**
  - The chosen class (or its slot 2) is at capacity; the student has no active SG/1:1 waitlist entry.
- **Actions**
  - Two paths land here:
    1. User clicks "Join waitlist" on the browse page. The form posts to `joinWaitlistAction` with `group_size_type='small'` and a JSON list of 2–4 preferred class IDs from the `sg-waitlist-form.tsx` picker. `joinSgWaitlist` validates 2–4 distinct slots and inserts a `waitlist` row with `class_id=NULL`, `preferred_class_ids=[…]`, `status='waiting'`.
    2. User completes the normal `enrollAction` form, but `reserve_seat` raises "full"/"capacity". The action falls through to a recovery branch that calls `joinSgWaitlist` with the picked slots and returns `{ waitlisted: true }`.
- **Expected**
  - One `waitlist` row in `waiting` status; user redirected to `/enroll?waitlisted=sg`.
- **Invariants checked**
  - **I-31**: at most one active SG/1:1 waitlist entry per student.
  - **I-32**: 2–4 preferred slots.

### Direct enrollment — full class, LG → join LG waitlist

- **Preconditions**
  - LG class is at capacity but has not yet started (`class_start_date > today`).
- **Actions**
  - User clicks "Join waitlist". `joinWaitlistAction` calls `checkEligibility` (eligibility is required for LG join), then `joinWaitlist` inserts `class_id=<that LG class>, status='waiting'`.
- **Expected**
  - LG `waitlist` row in `waiting`.
- **Invariants checked**
  - **I-30**: one waiting/notified row per (student, class).

### LG seat opens → auto-enroll the next waiter (transition trigger, not user action)

- **Preconditions**
  - An LG enrollment was deleted, canceled, or refunded (drop / Stripe expire / refund / auto-unenroll).
  - One or more LG `waitlist` rows are in `waiting`.
- **Actions**
  - The DB trigger `trg_queue_waitlist_notification` enqueues the freed `class_id` into `waitlist_notify_queue`.
  - The `waitlist-notify` cron drains the queue every 5 minutes and calls `dispatchWaitlistAutoEnroll(classId)` → for LG, `auto_enroll_from_waitlist` RPC.
  - The RPC `FOR UPDATE SKIP LOCKED`s the `waiting` rows in FIFO order, drops any with NULL agreement, validates eligibility (no dup, no time conflict on slot_1/2/3), and inserts the enrollment as `active+unpaid` (I-11). The `waitlist` row goes to `converted`.
  - Belt-and-suspenders: drop / cancel-makeup / auto-unenroll also call `dispatchWaitlistAutoEnroll` directly (synchronous path).
- **Expected**
  - Next eligible LG waiter is enrolled with a 7-day payment window. They get a notification.
- **Invariants checked**
  - **I-11** (deadline).
  - **I-35** (race-safe FIFO advancement).
  - **I-36** (NULL agreement → expired, not enrolled).

### SG seat opens → notify next waiter (transition trigger)

- **Preconditions**
  - An SG enrollment was deleted/canceled/refunded.
  - At least one SG `waitlist` row in `waiting` lists this class in `preferred_class_ids`.
- **Actions**
  - DB trigger enqueues, the `waitlist-notify` cron dispatches; `dispatchWaitlistAutoEnroll` routes to `notifySgWaitlistNext`.
  - The function walks `waiting` SG entries in FIFO; for each, it counts open capacity across `preferred_class_ids` and requires **at least 2 open slots** (I-33). If found, it sets `status='notified'`, `offer_expires_at = now + 3d`, inserts a parent/student notification, and emails the offer.
  - The cron also runs `auto_enroll_sg_from_waitlist` from its sweep step. That RPC actually creates the enrollment for the first eligible waiter who has 2 open slots on **distinct meeting days** (added in 00091).
- **Expected**
  - Either: a notification is sent (3-day offer window), OR an enrollment is auto-created if the cron's auto-enroll path picks up the entry.
- **Invariants checked**
  - **I-33** (≥2 open slots on distinct days).
  - **I-15** (no two slots on the same day).
  - **I-36** (NULL agreement skipped).

### SG waitlist offer accept

- **Preconditions**
  - A `waitlist` row in `notified` status with `offer_expires_at > now()`. The owning user is authenticated.
- **Actions**
  - User clicks the offer link → `/enroll/waitlist-offer/[waitlistId]`. The page renders `accept-form.tsx` with a slot picker (showing only `preferred_class_ids` that still have capacity), agreement (already accepted at waitlist join — re-displayed), payment choice, and subject category.
  - Submit fires `acceptOfferAction`:
    - Verifies `entry.status === 'notified'` and `offer_expires_at` is in the future.
    - Verifies ownership of the student.
    - Verifies both chosen slots are in `preferred_class_ids`.
    - `reserve_seat(slot_1, slot_2, agreement_*, p_pay_later)` — same RPC as direct enrollment.
    - On success: marks the `waitlist` row `converted`, runs `resolve_enrollment_makeup_conflicts`, then either Stripe Checkout (pay-now) or success page (pay-later).
    - On failure (slots filled in the meantime): reverts the waitlist row to `waiting` (`notified_at=NULL`, `offer_expires_at=NULL`) so the next dispatch can re-notify.
- **Expected**
  - Enrollment created; waitlist row `converted`. Or — on race loss — waitlist row safely back to `waiting`.
- **Invariants checked**
  - **I-30 / I-31**: at-most-one waitlist row preserved.
  - **I-22**: capacity locked atomically inside `reserve_seat`.

### SG waitlist offer expires unaccepted

- **Preconditions**
  - `notified` row with `offer_expires_at < now()`.
- **Actions**
  - The `waitlist-notify` cron's `expireStaleNotifications` step flips `notified → expired`, then cascades by calling `notifySgWaitlistNext` for every class in the expired entry's `preferred_class_ids`.
- **Expected**
  - Row is `expired`. The next waiter (FIFO) becomes `notified` if 2+ of their preferred slots are open.
- **Invariants checked**
  - **I-34**: offer-window expiry.

### Re-enrollment blocked by Phase 2 drop (negative scenario)

- **Preconditions**
  - The student previously dropped this class in Phase 2 (≤ 7 days before start through 7 days after start). `class_blocked = true` on the prior enrollment row.
- **Actions**
  - User attempts to enroll in the same class via `/enroll/[classId]`.
  - `checkEligibility` finds the `class_blocked` row matching any of the slot IDs and returns `eligible=false` with a re-enrollment message.
- **Expected**
  - Action returns the eligibility error; no Stripe call, no row created. UI surfaces the message.
- **Invariants checked**
  - **I-25**: Phase 2 drop blocks re-enrollment in that class.

### Re-enrollment cap exceeded (negative scenario)

- **Preconditions**
  - The student already has `MAX_REENROLL_PER_SUBJECT` (= 3) enrollments in the same subject.
- **Actions**
  - `reserve_seat` (or the `auto_enroll_from_waitlist` RPC) raises a re-enrollment-cap exception.
- **Expected**
  - Action returns the error; no row created.
- **Invariants checked**
  - **I-23**: re-enrollment cap.
