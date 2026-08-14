# 07 — Data Model

Status: **REWRITTEN 2026-08-14** against `14_GROUND_TRUTH_INTERVIEW.md` + ADR-003/004/005.

> **Removed by ADR-004:** the `entitlements` table and every paywall-related column. Content is
> free; nothing gates a lesson.
> **Removed by ADR-003:** any tutor entity. The operator is solo; availability has no tutor
> dimension.

## Conventions

- Postgres via Supabase. All tables `public` unless noted.
- **All timestamps `timestamptz`, stored UTC.** Rendering in the visitor's zone is a display
  concern only (spec/14 §12).
- **Money in integer cents.** Never floats.
- RLS on by default; correctness-critical writes go through `SECURITY DEFINER` RPCs (CON2), never
  direct client writes.

---

## Identity

### `accounts`
The buyer. One row per login.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `email` | text | from Supabase auth |
| `is_admin` | bool | default false; the single operator |
| `created_at` | timestamptz | |

### `learner_profiles`
A learner under a buyer. **No credentials — this is not a login** (ADR-003, INV-ACTOR-1).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK → `accounts` | owner |
| `name` | text | |
| `grade` | text | K–12 |
| `current_course_node` | text | a **course-level** roadmap node id (ADR-005); selects assessment questions |
| `created_at` | timestamptz | |

**RLS:** a buyer reads/writes only rows where `account_id = auth.uid()`.

> Keeping `accounts` and `learner_profiles` distinct — even when the buyer is the learner — is what
> makes a future profile→login upgrade additive (CON3).

---

## Content & progress

### `questions` *(exists — migration `0002`)*
Keyed to in-repo lessons by `lesson_slug` = roadmap node id (ADR-001/002). Rows are world-readable,
but **column-level grants withhold `answer` / `tolerance` / `explanation`** from `anon` and
`authenticated`; only the service role reads them. **Unchanged by this rewrite.**

### `question_attempts`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid FK → `learner_profiles` | |
| `question_id` | uuid FK → `questions` | |
| `is_correct` | bool | |
| `submitted_at` | timestamptz | |

Written **only when signed in**. Anonymous practice records nothing — that is what keeps lesson
pages static (ADR-004).

### `lesson_progress`
| column | type | notes |
|---|---|---|
| `profile_id` | uuid FK | |
| `lesson_slug` | text | roadmap node id |
| `completed_at` | timestamptz | null until complete |

**A lesson is complete only when every one of its practice questions has been answered correctly**
(spec/14 §16). PK `(profile_id, lesson_slug)`.

---

## Money

### `credit_ledger`
Append-only. **Balance = Σ`delta`** — never a stored counter.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK | wallet owner |
| `delta` | int | +N purchase/refund, −1 spend |
| `reason` | text | `purchase` · `booking_spend` · `cancel_refund` · `noshow_return` · `admin_adjust` |
| `booking_id` | uuid FK nullable | |
| `created_at` | timestamptz | |

**INV-MONEY-1:** balance may never go negative. Enforced inside the spend RPC under row lock, not by
application code. **Credits never expire** — no expiry column exists, deliberately.

### `purchases`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK | |
| `sku` | text | `first_session` · `credits_1` · `credits_2` · `credits_4` · `credits_8` |
| `amount_cents` | int | |
| `goal` | text nullable | **First Session only**: `strengths` · `test_prep` · `class_help` (ADR-005) |
| `stripe_session_id` | text unique | |
| `created_at` | timestamptz | |

**INV-MONEY-2 (one per customer):** at most one `sku = 'first_session'` row per `account_id`.
Enforced by a **partial unique index** plus a pre-checkout check (ADR-005) — the index is what makes
it true under concurrency.

### `stripe_events`
| column | type | notes |
|---|---|---|
| `event_id` | text PK | Stripe's id |
| `processed_at` | timestamptz | |

**INV-MONEY-3:** webhook redelivery is a no-op. Insert-first on this table is the idempotency guard.

---

## Booking

### `availability_rules` / `availability_exceptions`
A **recurring weekly template plus exceptions** (spec/14 §12) — not a Google Calendar read.

`availability_rules`: `weekday` (0–6), `start_time`, `end_time`, `active`.
`availability_exceptions`: `date`, `kind` (`blackout` | `extra`), optional time range.

Bookable slots are **derived** from rules minus blackouts plus extras, materialized in UTC.

### `bookings`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK | who pays |
| `profile_id` | uuid FK | who attends |
| `starts_at` | timestamptz | UTC; **60 minutes**, universally |
| `status` | text | `booked` · `cancelled` · `completed` · `no_show` |
| `purchase_id` | uuid FK nullable | set when this is the First Session |
| `meet_url` | text nullable | **nullable on purpose** — see below |
| `calendar_event_id` | text nullable | |
| `created_at` | timestamptz | |

**INV-BOOK-1:** a slot holds at most one non-cancelled booking. Enforced by row lock inside
`book_session`, in the same transaction as the credit spend (CON2).

**INV-BOOK-2:** `meet_url` is nullable **by design**. The Calendar event is created *after* the
booking transaction commits, so a Google outage yields a valid booking with a missing link — never a
lost booking (S10). Null links surface on the admin queue for repair.

**Policy (spec/14 §15):** 24h minimum notice · 4-week horizon · free cancel or **reschedule** at
24h+ (reschedule moves the slot and **does not touch the ledger**) · 15 minutes late = no-show,
credit burns.

### `credit_return_requests`
The no-show appeal (spec/14 §15) — a request/approve flow, not a silent admin fix.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `booking_id` | uuid FK | |
| `account_id` | uuid FK | requester |
| `reason` | text | |
| `status` | text | `pending` · `approved` · `denied` |
| `resolved_at` | timestamptz nullable | |

Approving writes **exactly one** `credit_ledger` row (`reason = 'noshow_return'`) and is audited.

---

## Assessment (First Session)

### `assessments`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `purchase_id` | uuid FK | |
| `profile_id` | uuid FK | |
| `mode` | text | `strengths` · `test_prep` — **never `class_help`**, which has no assessment (ADR-005) |
| `completed_at` | timestamptz nullable | |

### `assessment_items`
One row per asked question, recording the probe-and-descend walk.

| column | type | notes |
|---|---|---|
| `assessment_id` | uuid FK | |
| `question_id` | uuid FK | |
| `node_id` | text | roadmap node probed |
| `is_correct` | bool | |
| `depth` | int | how far the descent went below the current course |

`depth` is what makes the written plan possible: it locates the floor, which is the whole point of
descending.

---

## Audit

### `audit_log`
Every money- or booking-touching action: `actor_id`, `action`, `target`, `payload` jsonb, `at`.
Required for all admin adjustments and credit-return approvals (NFR-OPS).

---

## Entity map

```
accounts ─┬─< learner_profiles ─┬─< question_attempts
          │                     ├─< lesson_progress
          │                     └─< assessments ──< assessment_items
          ├─< purchases  (≤1 first_session per account)
          ├─< credit_ledger  (balance = Σ delta)
          └─< bookings ──< credit_return_requests

availability_rules + availability_exceptions ──► derived slots ──► bookings
questions ──(lesson_slug = roadmap node id)──► content/*.mdx + roadmap.json
```

**No `entitlements` table. No `tutors` table.** Both absences are deliberate (ADR-004, ADR-003).
