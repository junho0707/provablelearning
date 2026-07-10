# 07 — Data Model

Status: **DRAFT** · Supabase/Postgres entities for v2's dynamic state. Lesson prose is **not** in
the DB — it lives as in-repo MDX (ADR-001); the DB references content by `lesson_slug`. Field
lists are indicative, not final DDL (that arrives with migrations at implementation). Every
persisted business rule here traces to a requirement.

## Entities

### `profiles` (extends `auth.users`)
- `id` (PK, = auth user id), `role` (`independent_student`|`parent`|`dependent_student`|`admin`),
  `email`, `display_name`, `parent_id` (FK→profiles, nullable — set only for dependents),
  `consent_status` (`pending`|`granted` — dependents only), `consent_at`, `created_at`.
- **Rules:** exactly one role (REQ-ACCT-001); role immutable after creation
  (REQ-ACCT-006, trigger); `parent_id` set ⇔ role = `dependent_student` (REQ-ACCT-007); a
  dependent is usable only when `consent_status = granted` (REQ-ACCT-004, CON3).

### `questions`
- `id` (PK), `lesson_slug` (content join key), `position` (int), `type`
  (`mcq`|`numeric`|`free`), `prompt`, `choices` (jsonb, mcq), `answer`, `tolerance` (numeric,
  numeric type), `explanation`.
- **Rules:** ordered within a lesson by `position`; `free` questions carry no auto-checkable
  answer (self-checked, REQ-PRACTICE-001); world-readable (NFR-SEC-001).

### `question_attempts`
- `id` (PK), `user_id` (FK→profiles), `question_id` (FK→questions), `submitted`,
  `is_correct` (nullable — null for `free`), `attempted_at`.
- **Rules:** logged-in only (REQ-PROGRESS-001); owner reads own, parent reads dependents'
  (NFR-SEC-001).

### `lesson_progress`
- `id` (PK), `user_id` (FK→profiles), `lesson_slug`, `status` (`in_progress`|`completed`),
  `completed_at`.
- **Rules:** unique on `(user_id, lesson_slug)` (REQ-PROGRESS-002); same read authz as attempts.

### `credit_packs` (config)
- `id` (PK), `credits` (int), `price_cents` (int), `stripe_price_id`, `active` (bool).
- **Rules:** the purchasable tiers; base = 4 credits / $300; full tier set = D2/OQ1
  (REQ-BILLING-003).

### `credit_ledger` (append-only)
- `id` (PK), `payer_id` (FK→profiles), `delta` (int, + for purchase/refund, − for spend),
  `reason` (`purchase`|`spend`|`refund`), `ref` (jsonb/text — Stripe event, booking id, admin
  note), `created_at`.
- **Rules:** balance(payer) = Σ `delta` (REQ-CREDIT-001); append-only, never updated/deleted —
  corrections are new rows (REQ-CREDIT-005); `payer_id` role ∈ {`parent`,`independent_student`}
  (REQ-CREDIT-004); balance never < 0 (enforced by the spend RPC, REQ-CREDIT-003).

### `availability_slots`
- `id` (PK), `start_at`, `end_at`, `status` (`open`|`booked`|`closed`), `created_by` (admin).
- **Rules:** 45-min slots (REQ-CREDIT-002); a slot is `booked` by at most one active Session
  (REQ-BOOK-003); open slots world-readable, mutated by admin only.

### `bookings` (a booked Session)
- `id` (PK), `slot_id` (FK→availability_slots), `payer_id` (FK→profiles),
  `attendee_id` (FK→profiles), `status` (`booked`|`cancelled`|`completed`),
  `ledger_spend_ref` (FK→credit_ledger), `calendar_event_id`, `meet_url`,
  `reminded_24h` (bool), `reminded_1h` (bool), `created_at`, `cancelled_at`.
- **Rules:** created atomically with the `spend` row inside the booking RPC (REQ-BOOK-002);
  if payer is a parent, `attendee_id` ∈ that parent's dependents; if independent,
  `attendee_id = payer_id` (REQ-BOOK-004); reminder flags drive idempotent reminders
  (REQ-NOTIFY-001).

### `stripe_events` (webhook idempotency)
- `id` (PK, = Stripe event id), `type`, `processed_at`.
- **Rules:** unique event id makes redelivery a no-op → exactly-once credit (REQ-BILLING-002,
  NFR-REL-001).

### `admin_logs` (audit)
- `id` (PK), `actor_id` (FK→profiles), `action`, `target`, `meta` (jsonb), `created_at`.
- **Rules:** money/booking/admin actions are logged (NFR-OPS-002).

## Relationships

```
profiles ─┐ (parent_id self-FK)                availability_slots 1──1 bookings (active)
          ├─< question_attempts >── questions   profiles(payer) 1──< bookings
          ├─< lesson_progress                   profiles(attendee) 1──< bookings
          ├─< credit_ledger (payer)             credit_ledger 1──1 bookings (spend ref)
          └─< bookings (payer / attendee)       credit_packs (config, no FK from ledger)
questions.lesson_slug ─┐
lesson_progress.lesson_slug ─┴─ (soft) ─ content/*.mdx frontmatter.slug   ← ADR-001 join
```

## Ownership & RLS (NFR-SEC-001)

| Entity | Read | Write |
|---|---|---|
| `questions`, content | world | admin |
| `availability_slots` (open) | world | admin |
| `question_attempts`, `lesson_progress` | owner + owning parent + admin | owner (via app) |
| `credit_ledger` | owner payer + admin | **RPC/webhook/admin only** |
| `bookings` | payer + attendee + owning parent + admin | **RPC/admin only** |
| `profiles` | self + own parent + admin | self (limited) + admin |
| `admin_logs`, `stripe_events` | admin/system | system only |

## Key invariants (persisted)

- **INV-1** balance(payer) = Σ `credit_ledger.delta`, and is never negative. *(REQ-CREDIT-001/003)*
- **INV-2** `credit_ledger` is append-only. *(REQ-CREDIT-005)*
- **INV-3** a slot has at most one active (`booked`) booking. *(REQ-BOOK-003)*
- **INV-4** every `booked` booking has exactly one matching `spend` ledger row. *(REQ-BOOK-002)*
- **INV-5** dependent usable ⇔ `consent_status = granted` and `parent_id` set. *(REQ-ACCT-004)*
- **INV-6** attendee is the payer (independent) or one of the payer's dependents (parent).
  *(REQ-BOOK-004)*
- **INV-7** one Stripe event credits at most once. *(REQ-BILLING-002)*

## Transaction boundaries (`SECURITY DEFINER` RPCs — NFR-SEC-002)

- **`book_session(slot_id, attendee_id)`** — one tx: `SELECT … FOR UPDATE` the slot; verify
  `open` + balance ≥ 1 + attendee validity; insert `spend`(−1); set slot `booked`; insert
  booking. All-or-nothing. *(REQ-BOOK-002, INV-1/3/4/6)*
- **`process_purchase(stripe_event)`** — insert `stripe_events` (unique) then `purchase` ledger
  row; if the event exists, no-op. *(REQ-BILLING-002, INV-7)*
- **`cancel_booking(booking_id)`** — one tx: set booking `cancelled`, reopen slot; if ≥24h before
  start, insert `refund`(+1). Idempotent. *(REQ-BOOK-005, INV-1/2)*
- **`refund_credit(payer_id, amount, note)`** — admin: insert `refund` row + audit log.
  *(REQ-BILLING-005)*

## Migration & content-integrity notes

- Ships as ordered Supabase migrations at implementation (fresh schema — not a v1 migration).
- **Slug integrity (ADR-001 follow-up):** every `questions.lesson_slug` / `lesson_progress
  .lesson_slug` must correspond to an existing MDX lesson slug; a build/CI check should flag
  orphans, since the content tree lives outside the DB.
