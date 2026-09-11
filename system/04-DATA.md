# 04 — Data

The implementation contract: tables, invariants, and what must change from what exists today.
Migrations `0001`–`0016` are already applied; this document describes the **target** state and marks
each item **EXISTS**, **CHANGE**, or **NEW**.

## 1. Invariants

These are enforced in Postgres — in `SECURITY DEFINER` functions, constraints, and RLS — never in
application code alone. Application-layer checks are conveniences; the database is the authority.

| ID | Invariant |
|---|---|
| `INV-MONEY-1` | A credit is spent if and only if a booking row is created, in one transaction. |
| `INV-MONEY-2` | Balance is the sum of `credit_ledger` rows. No counter column ever holds it. |
| `INV-MONEY-3` | A Stripe event is applied at most once, keyed on its event id. |
| `INV-BOOK-1` | At most one active booking may exist per slot. |
| `INV-BOOK-2` | `meet_url` is nullable; a Calendar failure leaves a valid booking with no link. |
| `INV-BOOK-3` | A booking may not start sooner than 2 hours from creation, unless its slot was released by a cancellation, in which case the floor is 1 hour. |
| `INV-CREDIT-1` | A booking's credit can be returned at most once. |
| `INV-CREDIT-2` | Approved credit returns for one student within one calendar month never exceed 2. |
| `INV-FIRST-1` | Each student has at most one First Session entitlement, ever. |
| `INV-ACTOR-1` | No student-authenticated request may read or write any billing, credit, booking, or messaging row. |
| `INV-AUTH-1` | A student credential is created, changed, or reset only by the buyer who owns that student. |
| `INV-AUTH-2` | No auth email is ever sent to a student address. |
| `INV-COPPA-1` | No student-submitted row may exist for an account with no recorded consent event. |

## 2. Identity and accounts

| Table | State | Notes |
|---|---|---|
| `accounts` | **EXISTS** | One row per buyer, auto-provisioned by a trigger on `auth.users`. Carries `phone` for the SMS worklist. RLS scopes to `auth.uid()`. |
| `learner_profiles` | **CHANGE** | The student record. Has `name`, `grade`, `current_course_node`, `purposes text[]`. |
| `consent_events` | **NEW** | One row per consent-establishing event: account, mechanism (`stripe_payment`), timestamp, and the purchase that established it. Revocation is a row, not a deletion. |

### `learner_profiles` — required changes

- **`auth_user_id uuid`** — the student's own `auth.users` row. Null until the buyer sets
  credentials. This is what makes a profile a login.
- **`username text unique`** — the student's sign-in name, mapped to an internal email-shaped
  identity for the auth provider.
- **`login_active boolean`** — false until consent clears (`INV-COPPA-1`). Set true by the consent
  event, false again by revocation.
- **`current_math_class text`** and **`previous_math_class text`** — the math-diagnostic flow needs
  both (`03-FLOWS.md` F6). `current_course_node` remains the roadmap-node form of the same idea and
  should be reconciled with, not duplicated by, these.
- **Purposes: `purposes text[]` must be replaced** by an ordered **primary** and **secondary**
  purpose with free text permitted. The current column is constrained to
  `strengths | test_prep | class_help`, which is the *old* three-mode vocabulary and cannot express
  the taxonomy in `02-POLICIES.md` §7 (five school sub-purposes, three test types) nor free text.

`INV-ACTOR-1` is enforced here: RLS on every billing, credit, booking, and messaging table must
require the requesting `auth.uid()` to be an **account**, never a student `auth_user_id`.

## 3. Money

| Table | State | Notes |
|---|---|---|
| `credit_ledger` | **EXISTS** | Append-only. Reasons include `purchase`, `booking_spend`, `cancel_refund`, `noshow_return`, admin adjustment. Balance = sum. |
| `purchases` | **CHANGE** | Records a Stripe purchase and its `goal`. |
| `stripe_events` | **EXISTS** | Idempotency ledger for webhooks (`INV-MONEY-3`). |

### Required changes

- **First Session becomes per student.** Today one-per-customer is enforced against the account. It
  must be enforced against the **student** (`INV-FIRST-1`), which means `purchases` (or a dedicated
  entitlement row) must carry `profile_id` and the uniqueness constraint must move with it.
- **`goal` vocabulary** must widen to the `02-POLICIES.md` §7 taxonomy, in step with
  `learner_profiles`, so the two do not drift apart. They are the same question asked at two moments.

## 4. Scheduling

| Table | State | Notes |
|---|---|---|
| `availability_rules` | **EXISTS** | Recurring weekly template. |
| `availability_exceptions` | **EXISTS** | One-off blackouts and extra slots. |
| `bookings` | **CHANGE** | `account_id`, `profile_id`, `starts_at`, `status`, `purchase_id`, `meet_url`, `calendar_event_id`. |
| `audit_log` | **EXISTS** | Lifecycle actions. |

### Required changes

- **Notice window 24h → 6h**, and the **1-hour floor for released slots** (`INV-BOOK-3`). This is a
  change to `book_session` and to slot derivation, plus the cancellation path must return the slot to
  the open pool rather than merely marking the booking cancelled.
- **Release cadence:** the 4-week horizon steps **every Monday**, rather than advancing daily.
- **Purpose capture on the booking** — `purpose`, `sub_purpose`, `specifics text`, and
  `topic_mode` (`continue` | `new`). These are captured at booking time (`03-FLOWS.md` F5) and drive
  everything downstream. None of these columns exist today.

## 5. Session work

All four of these are **NEW**. They are the substance of what the product delivers and nothing in the
current schema covers them.

| Table | Purpose |
|---|---|
| `pre_session_submissions` | One row per booking: the student's typed inputs (topic, unit, what the test covers, current/previous class) and completion state. |
| `session_uploads` | Files attached to a booking, by student or buyer. Type restricted to `.doc`/`.docx`/PDF plus Google Docs links. Visible to that student, their buyer, and the tutor. Deleted on the retention schedule in `06-AUTH-AND-COPPA.md`. |
| `post_session_materials` | One row per booking: the tutor's hand-authored deliverable — roadmap, per-topic strengths, explanations — with `published_at` for the 24-hour target. |
| `material_progress` | The student's progress through the delivered material and its practice questions, so a later session resumes rather than restarts. |

## 6. Assessments and diagnostics

| Table | State | Notes |
|---|---|---|
| `practice_tests`, `test_prep_questions` | **EXISTS** | Hand-authored test-prep instruments. The right shape for PSAT/SAT/ACT diagnostics. |
| `assessments`, `assessment_items` | **CHANGE** | A student's sitting of an assessment and their answers. |
| `questions`, `question_attempts`, `lesson_progress` | **EXISTS** | The practice-question engine. Answers are hidden from `anon`/`authenticated` by **column-level grants**; only the service role reads them. Do not route question reads through a client that needs those columns. |

### Required changes

- **Math-by-class diagnostics must be authorable as data.** The existing `assessments` machinery was
  built around an algorithmic probe-and-descend traversal of the roadmap. The decision is now that
  the operator **hand-authors a diagnostic per class level, covering everything up to that level**
  (`03-FLOWS.md` F6). The `practice_tests` shape already fits this; the math diagnostics should reuse
  it keyed by class level rather than by test name.
- **Taken once per test or class level**, not once per session — an assessment is looked up before it
  is offered.
- **Graceful absence:** if no diagnostic exists for the requested test or level, the student is asked
  for descriptive inputs instead and the tutor is flagged. A missing diagnostic never blocks a
  session.

## 7. Credit returns

| Table | State |
|---|---|
| `credit_return_requests` | **CHANGE** — `booking_id`, `account_id`, `reason`, `status`, `resolved_at`. |

### Required changes

- **Eligibility** today is "the credit was burned" — a `no_show`, or a `cancelled` booking with no
  `cancel_refund` ledger row — computed against a **24-hour** rule. The window becomes **2 hours** (`0019`, narrowed by `0024`).
- **The 2-per-calendar-month cap is not implemented at all** (`INV-CREDIT-2`). It must be enforced
  **per student**, combined across late cancellations and no-shows, in the approval function — not in
  the admin UI. An approval that would be the third in a month must be refused by the database.
- **The remaining allowance must be readable** by the buyer, since `03-FLOWS.md` F9/F10 require
  showing it before they cancel and when they are notified of a miss.
- **The third miss offers no request at all**, so the request function must also refuse to *create* a
  request once the month's cap is used.

## 8. Messaging

`messages` — **NEW**. One thread per buyer, rows carrying sender (`buyer` | `tutor`), body, and read
state. RLS restricts a thread to its buyer and the tutor. **Students have no access
(`INV-ACTOR-1`).**

## 9. Content

`questions`, `lesson_progress`, and the MDX catalog stay as they are, but **no public route exposes
them at launch** (`00-BUSINESS.md` §1). The tables remain because post-session materials draw on the
same question bank.
