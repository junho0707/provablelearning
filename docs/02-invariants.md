# L1′ — Entity lifecycles & invariants

The contract every other layer relies on. Each invariant has a stable global ID. Journey scenarios cite invariants by ID. When you change an invariant, search the docs for its ID before you ship.

Statuses below are the literal `enum`/`text` values stored in Postgres (defined in `src/lib/types.ts` and the `enum`-defining migrations).

---

## Cross-cutting

- **I-1** Authentication is the only authorization principal. RLS enforces that users see only their own rows; parents see their children's; admins see all. Service-role inserts/updates bypass RLS but are confined to server actions, RPCs, webhook handlers, and crons.
- **I-2** Every `enrollment` row is created exclusively through the `reserve_seat` `SECURITY DEFINER` RPC. No direct INSERT path exists for parents/students. (Admin client is the only INSERT path used elsewhere — webhooks, auto-enroll RPCs.)
- **I-3** Every `agreement_version` and `agreement_timestamp` recorded at enrollment time is immutable on `active` enrollments. Trigger: `agreement_immutable` on the `enrollments` table.
- **I-4** A `users` row's `role` is immutable after creation. Trigger: prevents UPDATE of `role`. Admins exist only via seed.
- **I-5** A `students.user_id` and `students.email` map at most one external identity to one student record. Phone enforcement triggers run on both `users` and `students`.
- **I-6** Every state-mutating operation that crosses a row lock uses Postgres `FOR UPDATE` row locks inside a `SECURITY DEFINER` RPC: `reserve_seat`, `apply_credits`, `book_makeup_session`, `book_makeup_with_credit`, `auto_enroll_from_waitlist`, `auto_enroll_sg_from_waitlist`, `auto_book_makeup_from_waitlist`, `cancel_session`, `cancel_makeup_booking`, `drop_enrollment`, `reverse_credits`. Concurrent callers serialize on the locked row.

---

## Enrollment

### Status values
`pending` · `active` · `completed` · `refunded` · `canceled` (note: single `l`)

### Payment status values
`paid` · `unpaid`

### Lifecycle

```
                   ┌────────────────┐
                   │   (no row)     │
                   └────────────────┘
                          │ reserve_seat (pay-now)
                          ▼
        ┌──────────────────────────────────────┐
        │  pending / paid                      │
        │  stripe_session_id set               │
        └──────────────────────────────────────┘
              │                            │
   webhook    │                            │  webhook checkout.expired
   completed  │                            │  OR reconcile cron
              ▼                            ▼
   ┌────────────────────┐         ┌──────────────────────┐
   │  active / paid     │         │  (row deleted,       │
   │                    │         │   seat freed,        │
   │                    │         │   waitlist notified) │
   └────────────────────┘         └──────────────────────┘

                   ┌────────────────┐
                   │   (no row)     │
                   └────────────────┘
                          │ reserve_seat (pay-later)
                          │   OR auto_enroll_from_waitlist
                          ▼
        ┌──────────────────────────────────────┐
        │  active / unpaid                     │
        │  payment_deadline = start + 7d       │
        └──────────────────────────────────────┘
                  │                   │              │
       pay-now    │      drop         │   auto-      │
       Stripe     │      Phase 1      │   unenroll   │
       webhook    ▼      ▼            ▼   cron       ▼
       ┌────────────┐  ┌──────────┐  ┌──────────────────┐
       │ active /   │  │ canceled │  │ canceled         │
       │ paid       │  │ (drop)   │  │ (non-payment)    │
       └────────────┘  └──────────┘  └──────────────────┘

   active ──drop Phase 2──► canceled (with class_blocked = true)
   active ──refund approved──► refunded
   active ──end of term───► completed   (admin)
```

### Invariants

- **I-10** A `pending` enrollment always has a non-null `stripe_session_id`. It is either activated by `checkout.session.completed` / `async_payment_succeeded` or freed by `checkout.session.expired` / `async_payment_failed`. There is no other terminal state for `pending`.
- **I-11** An `active` + `unpaid` enrollment always has a `payment_deadline = student_start_date + 7 days` (LG: same formula based on `class_start_date`). Once paid, `payment_deadline` is set to `NULL` by the Stripe webhook handler.
- **I-12** `class_id` and `slot_1_class_id` always equal each other on insert. `slot_1_class_id` is the canonical primary slot; `class_id` is preserved for legacy queries. Capacity counts must check `slot_1_class_id OR slot_2_class_id OR slot_3_class_id OR (slot_1_class_id IS NULL AND class_id = X)` to be correct.
- **I-13** All slots on one enrollment share the same `group_size_type`. `reserve_seat` raises if not.
- **I-14** All slots on one enrollment are different `class_id` values. `reserve_seat` raises on duplicates.
- **I-15** No two slots on one enrollment share the same `meeting_day`. Enforced at `check-eligibility` (UI) and at SG waitlist auto-enroll (`auto_enroll_sg_from_waitlist`, since migration 00091).
- **I-16** A student cannot have two `pending`/`active` enrollments where any of `{slot_1_class_id, slot_2_class_id, slot_3_class_id, class_id}` overlap. Enforced by `check-eligibility` and by the dup-check inside `auto_enroll_from_waitlist`.
- **I-17** A student cannot enroll in any class+time that conflicts with another `pending`/`active` enrollment of theirs. Enforced by the `committedSlots` check in `check-eligibility.ts` and by `v_conflict_count` in `auto_enroll_from_waitlist`.
- **I-18** `subject` and `level` on `classes` are NULL for SG and 1:1; required for LG. Enforced by `chk_sg_1on1_no_subject` and `chk_lg_requires_subject` (migration 00083).
- **I-19** `subject_category` and `subject_detail` are stored on the `enrollment`, not the class, for SG/1:1 (since 2026-03-09 rework). LG enrollments may leave them NULL.
- **I-20** LG enrollment is closed once `class_start_date <= CURRENT_DATE`. `reserve_seat` raises; `auto_enroll_from_waitlist` returns without enrolling.
- **I-21** Rolling enrollment window for SG/1:1: `student_end_date = student_start_date + 35 days` (flat 5-week window since migration 00091, was "4th Saturday" in 00090). LG uses the class's own `class_start_date` / `class_end_date`.
- **I-22** Capacity per `group_size_type`: 1:1 = 1, SG = 1–3, LG = 10–20. Enforced by CHECK constraints on `classes.capacity` keyed by `group_size_type`.
- **I-23** Re-enrollment cap: at most 3 enrollments per student per subject (`MAX_REENROLL_PER_SUBJECT` in `src/lib/constants.ts`).
- **I-24** Phase 1 self-serve drop is allowed only when more than `PHASE_1_DAYS_BEFORE_START` (= 7) days remain before `COALESCE(student_start_date, class_start_date)` AND `payment_status = 'unpaid'`. Phase 2 (≤ 7 days before start through 7 days after) requires admin or sets `class_blocked = true`. Phase 3 (> 7 days after start) requires a refund consultation. `drop_enrollment` RPC enforces phase rules.
- **I-25** `class_blocked = true` on any of the student's prior enrollments (Phase 2 drop residue) blocks re-enrollment in that class. Enforced by `check-eligibility.ts`.

### Transition triggers

- **`reserve_seat(p_pay_later=false)`** → inserts `pending` / `paid` row.
- **`reserve_seat(p_pay_later=true)`** → inserts `active` / `unpaid` row with `payment_deadline = start + 7d`.
- **`auto_enroll_from_waitlist`** (LG) → inserts `active` / `unpaid` row, sets waitlist row to `converted`.
- **`auto_enroll_sg_from_waitlist`** (SG/1:1) → calls `reserve_seat(p_pay_later=true)` with two distinct-day open preferred slots.
- **Stripe webhook `checkout.session.completed` (paid)** → `pending → active`, `payment_status = 'paid'`, `payment_deadline = NULL`. Handler in `src/lib/stripe/webhook-handlers.ts:handleCheckoutCompleted`.
- **Stripe webhook `checkout.session.async_payment_succeeded`** (ACH cleared) → same as above; delegates to `handleCheckoutCompleted`.
- **Stripe webhook `checkout.session.expired`** → if `pending`: deletes the row, reverses any applied credits, dispatches waitlist auto-enroll. If `active+unpaid`: clears `stripe_session_id` only (delayed-pay attempt expired; the seat stays).
- **Stripe webhook `checkout.session.async_payment_failed`** → same as `expired` plus an `admin_logs` entry of action `ach_payment_failed`.
- **Cron `auto-unenroll`** (`0 6 * * *`, `src/app/api/cron/auto-unenroll/route.ts`) → finds `active+unpaid` rows past `payment_deadline`, sets `status = 'canceled'`, dispatches waitlist auto-enroll for the freed slots, logs `auto_unenroll_unpaid`, removes Google Classroom membership.
- **Cron `reconcile`** (`0 6 * * *`, `src/app/api/cron/reconcile/route.ts`) → calls `reconcileStripePayments`. Cross-checks Stripe vs DB for active enrollments; cleans up `pending` rows older than 30 minutes; activates any `pending` rows whose Stripe session paid but webhook was missed.
- **Trigger `trg_queue_waitlist_notification`** on `enrollments` (DELETE / UPDATE to `canceled` / `refunded`) → inserts a row into `waitlist_notify_queue`. Drained by the `waitlist-notify` cron (see waitlist section).
- **`drop_enrollment` RPC** → enforces phase rules, sets `status = 'canceled'`, sets `class_blocked = true` on Phase 2, calls back into Classroom removal + waitlist auto-enroll from `src/lib/enrollment/drop.ts`.
- **Refund request approval** (admin server action `approveRefundRequest`) → calls Stripe refund, runs `reverse_credits` if applicable, sets `status = 'refunded'` on the enrollment.

---

## Waitlist (enrollment)

### Status values
`waiting` · `notified` · `expired` · `converted`

### Two distinct waitlist shapes

| | LG (single-slot) | SG / 1:1 (multi-slot) |
|---|---|---|
| `class_id` | set | NULL |
| `preferred_class_ids` | NULL | array of 2–4 class IDs |
| Advance pattern | FIFO; auto-enroll the next waiter immediately | FIFO; **notify** with a 3-day offer window; student accepts |
| Offer window | 24 hours from `notified_at` (no `offer_expires_at`) | `offer_expires_at = notified_at + 3 days` |
| Triggering function | `notifyNextOnWaitlist` / `auto_enroll_from_waitlist` | `notifySgWaitlistNext` |

### Lifecycle

```
   joinWaitlist / joinSgWaitlist
            │
            ▼
        ┌──────────┐
        │ waiting  │
        └──────────┘
            │
   ┌────────┴────────────────────────────┐
   │ LG: auto_enroll_from_waitlist       │ SG/1:1: notifySgWaitlistNext
   │   creates active+unpaid enrollment  │   sets offer_expires_at = +3d
   ▼                                     ▼
┌──────────┐                       ┌──────────┐
│ converted│                       │ notified │
└──────────┘                       └──────────┘
                                        │
                            offer       │  accept (=create enrollment)
                            expired ────┼────►  converted
                            (cron)      │
                                        ▼
                                   ┌──────────┐
                                   │ expired  │
                                   └──────────┘
```

### Invariants

- **I-30** Exactly one row exists per `(student_id, class_id, status IN ['waiting','notified'])` for LG. Enforced by `joinWaitlist` pre-check.
- **I-31** Exactly one `waiting`/`notified` SG/1:1 entry exists per student. Enforced by `joinSgWaitlist` pre-check.
- **I-32** SG/1:1 `preferred_class_ids` length is between 2 and 4. Enforced by `joinSgWaitlist`.
- **I-33** SG/1:1 auto-enroll only fires when at least 2 of the student's preferred classes have capacity AND those 2 picks are on **distinct meeting days** (added in migration 00091).
- **I-34** Waitlist `notified` rows expire after their offer window: SG/1:1 use `offer_expires_at`; LG use `notified_at + 24h`. The `expireStaleNotifications` function in `src/lib/waitlist/notify-next.ts` handles both, then cascades by notifying the next person.
- **I-35** A `notify-next-on-waitlist` advancement is race-safe: the optimistic update `WHERE status = 'waiting'` ensures only one process can advance a given row; losers retry on the next entry. `auto_enroll_from_waitlist` uses `FOR UPDATE SKIP LOCKED` for the same reason.
- **I-36** A waitlist entry with NULL agreement is auto-expired before it can be advanced. Enforced inside `auto_enroll_from_waitlist` and `auto_enroll_sg_from_waitlist`.

### Transition triggers

- **`joinWaitlist` / `joinSgWaitlist`** (`src/lib/waitlist/join.ts`) → insert `waiting` row.
- **`dispatchWaitlistAutoEnroll(classId)`** (called from drop, Stripe expired, auto-unenroll, cancel-makeup, etc.) → routes to LG auto-enroll or SG/1:1 notify based on `group_size_type`.
- **DB trigger `trg_queue_waitlist_notification`** → enqueues a class_id into `waitlist_notify_queue` whenever an enrollment is deleted or moved to canceled/refunded.
- **Cron `waitlist-notify`** (`*/5 * * * *`, `src/app/api/cron/waitlist-notify/route.ts`) does three things in order:
  1. `expireStaleNotifications()` — expire LG entries past `notified_at+24h` and SG/1:1 past `offer_expires_at`; cascade.
  2. Drain unprocessed rows from `waitlist_notify_queue` and dispatch.
  3. Sweep all `waiting` entries (belt-and-suspenders) and dispatch.
- **Waitlist offer accept** (`src/app/(dashboard)/enroll/waitlist-offer/[waitlistId]/`) → calls `reserve_seat`; on success the trigger that updates the enrollment will mark the waitlist entry `converted`.

---

## Session cancellation

### Status values
`cancelled` · `rescheduled` · `expired` · `absent`

(Note: `credit_issued` was removed in migration 00089 and historical rows were converted to `expired`.)

### Lifecycle

```
   cancel_session RPC
            │
            ▼
        ┌──────────┐                     ┌──────────────┐
        │cancelled │ ─── book_makeup ──► │ rescheduled  │
        └──────────┘                     └──────────────┘
            │                                   │
   no makeup, > 7d (LG)                        │ makeup no_show
   or unexcused absence > 7d                   │   (cancel-credits cron)
            ▼                                   ▼
        ┌──────────┐                     ┌──────────────┐
        │ expired  │                     │  cancelled   │  (re-opened)
        └──────────┘                     └──────────────┘

        ┌──────────┐
        │ absent   │  ──── unexcused > 7d (cron) ───►  expired
        └──────────┘
```

### Invariants

- **I-40** LG sessions cannot be cancelled. `cancel_session` raises for `group_size_type = 'large'`; UI hides the cancel button.
- **I-41** Cannot cancel a past or same-day session. `cancel_session` raises.
- **I-42** SG sessions require ≥ 24 hours notice. `cancel_session` raises otherwise.
- **I-43** A session can be cancelled at most once per `(student_id, module_id, session_number)` (legacy uniqueness; carried into the post-rearchitecture model).
- **I-44** A `cancelled` row can have at most one **active** (`booked` or `attended`) makeup booking. `book-makeup.ts` deletes any prior `cancelled` makeup booking for the same `cancellation_id` before insert; `uq_makeup_cancellation` keeps it unique.
- **I-45** When a makeup is later cancelled or marked `no_show`, the parent cancellation reverts from `rescheduled` to `cancelled`, re-opening makeup booking. Done by `cancel_makeup_booking` RPC and by the `cancel-credits` cron.
- **I-46** LG cancellations expire after `session_date + 7 days`; unexcused `absent` rows expire after the same window. Cron `cancel-credits` performs both transitions.

### Transition triggers

- **`cancel_session` RPC** → inserts the row with status `cancelled`, blocked for LG.
- **`book_makeup_session` RPC** → `cancelled → rescheduled`.
- **`cancel_makeup_booking` RPC** → if the booking was rescheduled-from a parent cancellation, that parent goes `rescheduled → cancelled`.
- **`mark_student_absent` RPC** → admin-marked attendance creates a row with status `absent`.
- **Cron `cancel-credits`** (`0 */6 * * *`, `src/app/api/cron/cancel-credits/route.ts`):
  - Sets `cancelled` LG rows older than `session_date + 7d` to `expired`.
  - Sets `booked` makeups whose `session_date < today` to `no_show`; reopens their parent cancellations; restores credit if credit-based.
  - Sets unexcused `absent` rows older than `session_date + 7d` to `expired`.
  - Auto-books next waiter for each freed makeup session (`autoBookMakeupFromWaitlist`).

---

## Makeup booking

### Status values
`booked` · `attended` · `no_show` · `cancelled`

### Origin: cancellation OR credit

- **I-50** `makeup_bookings` rows have **exactly one** of `cancellation_id` or `credit_id` set. CHECK constraint enforces.
- **I-51** A makeup booking maps to a host class **session date**. The session number is derived from the host class's `class_start_date` (LG) or the student's `student_start_date` (SG/1:1) plus the host class's `meeting_day`.
- **I-52** No double-book: `(student_id, host_class_id, session_number)` is unique. `(cancellation_id)` is unique among non-cancelled bookings.
- **I-53** A makeup must fall on the host class's `meeting_day` and within the student's `[student_start_date, student_end_date]` enrollment window (or, for LG, the class's window). RPC raises otherwise.
- **I-54** A makeup must not be in a class the student is already enrolled in. RPC raises.
- **I-55** Capacity: `(active_enrollments_for_host_class) + (booked_makeups_for_that_session_date) <= host_class.capacity`.
- **I-56** Cannot book a makeup for a past or same-day session.
- **I-57** LG cancellations cannot have makeups (origin enforcement: RPC raises if cancellation `group_size_type = 'large'`).

### Transition triggers

- **`book_makeup_session(p_cancellation_id, p_host_class_id, p_session_date)`** RPC → `booked`. Side effects: matching `makeup_waitlist` rows for that cancellation are set to `booked`, parent cancellation flipped to `rescheduled`.
- **`book_makeup_with_credit(p_student_id, p_class_id, p_session_date, p_booked_by)`** RPC → `booked` with `credit_id` set; FIFO-deducts credit.
- **`cancel_makeup_booking` RPC** → `booked → cancelled`. Side effects: parent cancellation reverts (if applicable); credit refunded (if applicable). Triggers `autoBookMakeupFromWaitlist`.
- **Admin attendance mark** → `booked → attended` or `booked → no_show`.
- **Cron `cancel-credits`** → `booked → no_show` automatically when `session_date < today`.

---

## Makeup waitlist

### Status values
`waiting` · `notified` · `expired` · `booked`

- **I-60** Per `(student_id, cancellation_id, host_class_id)` there is at most one row. Enforced by `uq_makeup_wl_student_cancel_class`.
- **I-61** 1:1 cancellations cannot use the makeup waitlist. RPC raises (only SG is valid).
- **I-62** Cannot join within 6 hours of session start (`v_cutoff = session_date + meeting_time − 6h`). RPC raises.
- **I-63** Notify pattern is **fan-out, first-come-first-served** (not FIFO claim): when a slot opens, every `waiting` row for that `(host_class_id, session_number)` is flipped to `notified` simultaneously; the first to call `book_makeup_session` wins and the others find the session full.
- **I-64** A `waiting` row whose `session_date < today` is auto-expired by the `cancel-credits` cron.

### Transition triggers

- **`join_makeup_waitlist` RPC** → insert `waiting`.
- **`autoBookMakeupFromWaitlist` (`auto_book_makeup_from_waitlist` RPC)** → fires when a slot opens (cancel-makeup, no-show cron). Picks the FIFO-first eligible row, books, sets that row to `booked`. Other waiters stay `notified`.
- **`bookMakeupSession`** server action → side-effects matching `(cancellation_id)` rows in any of waiting/notified to `booked`.
- **`notifyMakeupWaitlist`** (`src/lib/cancellation/notify-makeup-waitlist.ts`) → called when a slot opens; flips all `waiting` to `notified` for that `(host_class_id, session_number)`.

---

## Credit

`credits` rows hold a `remaining_amount` and an optional `expires_at`. Credits are issued only by admin (refund approval).

- **I-70** A credit's `remaining_amount` only decreases via `apply_credits` or `book_makeup_with_credit`. Both run with `FOR UPDATE` row locks and FIFO-consume by `created_at`.
- **I-71** A credit is "spendable" iff `remaining_amount > 0` AND (`expires_at IS NULL` OR `expires_at > now()`). Enforced by `getCreditBalance` and credit-search RPCs.
- **I-72** A credit-based makeup booking restores the credit (`remaining_amount = 1`) when the booking is cancelled or marked `no_show`. `cancel_makeup_booking` RPC + `cancel-credits` cron.
- **I-73** Credits are not used for enrollment payment in the current model; they are only redeemable for makeup sessions (post-migration 00089 — auto-credit-from-cancellation flow was removed).

### Transition triggers

- **`reverse_credits` RPC** (admin server action `approveRefundRequest` with `refund_type='credit_reversal'`) → inserts a 1-unit credit row.
- **Direct admin insert** (`approveRefundRequest` with `refund_type='credit'`) → inserts the credit row directly.
- **`apply_credits` RPC** → FIFO-consumes against an enrollment (legacy path, retained).
- **`book_makeup_with_credit` RPC** → matches a credit by `(student_id, group_size_type, subject?, level?)`, decrements `remaining_amount`, inserts a `makeup_bookings` row with `credit_id`.
- **`cancel_makeup_booking` RPC / `cancel-credits` cron** → restore credit on cancel / no-show.
- **`reverse_credits` from Stripe expired webhook** → only for the historical `credits_applied` field on a `pending` enrollment. Reverses if Stripe checkout expired before paying.

---

## Refund request

### Status values
`pending` · `approved` · `denied`

- **I-80** A refund request is owned by a `parent_id` and bound to one `enrollment_id`. RLS enforces parent visibility; admins see all.
- **I-81** Approval transitions are atomic in `approveRefundRequest`: Stripe refund → reverse credits → enrollment marked `refunded` → request status `approved` → `admin_logs` entry → waitlist dispatch.
- **I-82** Once `approved` or `denied`, `reviewed_at` is set and the row is terminal. No transition back to `pending`.

### Transition triggers

- **Refund consultation booking** (Phase 3 drop) creates a `bookings` row of `booking_type='refund'`; admin discusses and may then create a `refund_requests` row.
- **Parent server action** `requestRefund` → inserts `pending`.
- **Admin server actions** `approveRefundRequest` / `denyRefundRequest` → set terminal status, may invoke Stripe refund.

---

## Booking (ad-hoc consultation)

### Status values
`confirmed` · `canceled` · `completed`

### Booking type
`initial` · `refund` (added in migration 00081 to allow both kinds independently)

### Reminder gate
`reminder_sent: boolean`

- **I-90** `bookings` rows are public-insertable (no auth required) — used by the `/book` page.
- **I-91** Each `confirmed` booking creates one Google Calendar event; `meet_link` is set if the user chose `meeting_type='meet'`.
- **I-92** A booking is reminded at most once: `reminder_sent` is set to `true` after sending. The cron only selects rows where `reminder_sent = false` AND `datetime` falls in a tight future window (~11–12 hours ahead, see `src/app/api/cron/booking-reminders/route.ts`).
- **I-93** Reminder delivery uses the user's stored `contact_method` (`email`, `sms`, or `both`). Fan-out via `Promise.allSettled`.

### Transition triggers

- **POST `/api/bookings/create`** → insert `confirmed`, fire-and-forget confirmation notification, create Calendar event.
- **Cron `booking-reminders`** (`0 * * * *`, `src/app/api/cron/booking-reminders/route.ts`) → send reminder, set `reminder_sent = true`.
- **Admin server action** → mark `completed` or `canceled` after the consultation.

---

## Cron schedule (transition triggers, full list)

All crons live in `vercel.json` and dispatch to `src/app/api/cron/*/route.ts`. Each route checks the `Authorization` header via `verifyCronSecret`.

| Path | Schedule (UTC) | Effects |
|---|---|---|
| `/api/cron/auto-unenroll` | `0 6 * * *` | Cancels `active+unpaid` past `payment_deadline`. Frees seat → waitlist dispatch. |
| `/api/cron/reconcile` | `0 6 * * *` | Cross-checks Stripe vs DB; cleans up orphaned `pending` rows older than 30 min. |
| `/api/cron/waitlist-notify` | `*/5 * * * *` | Expires stale waitlist notifications; drains `waitlist_notify_queue`; sweeps `waiting` entries. |
| `/api/cron/cancel-credits` | `0 */6 * * *` | Expires LG cancellations + unexcused absents past 7 days; marks `booked` makeups with past dates as `no_show` (restores parent cancellation / credit); expires past-date makeup waitlist; auto-books next from waitlist. |
| `/api/cron/booking-reminders` | `0 * * * *` | Sends ~12 h pre-meeting reminders for `confirmed` bookings; sets `reminder_sent = true`. |
| `/api/cron/backup` | `0 3 * * 0` | Weekly CSV export of `enrollments`, `performance_logs`, `credits`. (Drive upload TODO.) |
| `/api/cron/reports` | `0 8 1 * *` | Monthly per-student performance roll-up. (PDF + email TODO.) |

## Stripe webhook events (full list)

Handler: `src/app/api/webhooks/stripe/route.ts` → dispatches to `src/lib/stripe/webhook-handlers.ts`.

| Event | Effect |
|---|---|
| `checkout.session.completed` (paid) | `pending → active`, `payment_status = 'paid'`, invite to Google Classroom for slot 1 (and slot 2 if dual-slot SG). |
| `checkout.session.completed` (unpaid, ACH pending) | No-op; waits for `async_payment_succeeded`. |
| `checkout.session.async_payment_succeeded` | Same as `completed` (ACH cleared). |
| `checkout.session.expired` (pending) | Delete the row, reverse `credits_applied`, dispatch waitlist for both slots. |
| `checkout.session.expired` (active+unpaid, deferred-pay attempt) | Clear `stripe_session_id`; the seat keeps the active row. |
| `checkout.session.async_payment_failed` | Same as `expired` + log `ach_payment_failed` to `admin_logs`. |
