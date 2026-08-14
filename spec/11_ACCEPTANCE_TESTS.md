# 11 — Acceptance Tests

Status: **REWRITTEN 2026-08-14** against `03_REQUIREMENTS.md` + `05_FLOWS.md` + ADR-003/004/005.

Each `AT-*` is observable behavior — a thing that either happens or doesn't. Tests marked **[live]**
need a real Supabase/Stripe/Google stack; the rest are unit or integration tests.

> **Withdrawn by ADR-004:** every paywall test. The replacement, `AT-CONTENT-005`, asserts the
> *opposite* — that nothing is gated.

---

## Content & roadmap

- **AT-CONTENT-001** — An anonymous request for an authored lesson returns the full prose and
  rendered math. *(S1)*
- **AT-CONTENT-002** — A lesson node with no authored file renders "coming soon" and returns **200,
  not 404**. *(REQ-CONTENT-003)*
- **AT-CONTENT-003** — Every lesson page is prerendered at build and appears in `sitemap.xml`.
  *(NFR-PERF-001/003)*
- **AT-CONTENT-004** — Served lesson HTML contains question prompts and choices and **no answer,
  tolerance, or explanation**. *(NFR-SEC-003)* ✅ *passing*
- **AT-CONTENT-005** — **No content route requires an account.** An anonymous client receives 200 and
  full content for **every** lesson in the catalog — a regression guard against a paywall creeping
  back in. *(ADR-004, CON6)*
- **AT-ROADMAP-001** — `/roadmap` renders the full arc; unbuilt regions are marked locked and
  inherit to descendants. *(REQ-ROADMAP-002)* ✅ *passing*
- **AT-ROADMAP-002** — Selecting a node highlights its **transitive prerequisite chain**.
  *(REQ-ROADMAP-003)* ✅ *passing*
- **AT-ROADMAP-003** — No two nodes overlap in the computed layout. *(REQ-ROADMAP-001)* ✅ *passing*
- **AT-ROADMAP-004** — Course-level nodes are enumerable for the "current class" picker.
  *(REQ-ROADMAP-005)*

## Practice & progress

- **AT-PRACTICE-001** — MCQ checks by exact match; numeric within tolerance; free-response reveals
  without grading. *(REQ-PRACTICE-001)* ✅ *passing*
- **AT-PRACTICE-002** — Non-numeric input to a numeric question raises a clear malformed-submission
  error, not a false "incorrect". *(REQ-PRACTICE-003)* ✅ *passing*
- **AT-PRACTICE-003 [live]** — The `anon` role is **denied** the `answer` column while the service
  role reads it. *(NFR-SEC-003)* ✅ *passing locally*
- **AT-PRACTICE-004** — An anonymous visitor can submit an answer and get feedback; **nothing is
  recorded**. *(REQ-PRACTICE-004)*
- **AT-PROGRESS-001** — A signed-in attempt records against the **active profile**; switching
  profiles switches the view. *(REQ-PROGRESS-001/003)*
- **AT-PROGRESS-002** — A lesson flips to complete **only after every question is answered
  correctly** — one wrong answer leaves it incomplete. *(REQ-PROGRESS-002)*

## Accounts

- **AT-ACCT-001** — Sign-in works via Google OAuth and via magic link; **no password path exists**.
  *(REQ-AUTH-001)*
- **AT-ACCT-002** — The same email via both methods resolves to **one** account. *(REQ-AUTH-002)*
- **AT-ACCT-003** — A buyer creates/edits/switches/deletes learner profiles. *(REQ-ACCT-001)*
- **AT-ACCT-004** — A buyer who is their own learner (independent student) completes every flow —
  purchase, assessment, booking. *(REQ-ACCT-003)*
- **AT-SEC-001** — Account B cannot read account A's profiles, ledger, bookings, or progress.
  *(NFR-SEC-001)*
- **AT-SEC-002** — A non-admin is denied every admin surface and action. *(REQ-ADMIN-\*)*
- **AT-SEC-003** — A direct client write to `credit_ledger` or `bookings` is **denied**; only the
  RPCs succeed. *(NFR-SEC-002)*

## First Session

- **AT-FIRST-001** — A second First Session purchase by the same account is **refused**. *(S8,
  REQ-FIRST-001)*
- **AT-FIRST-002** — Each goal routes correctly: `strengths` → assessment, `test_prep` → practice
  test, **`class_help` → booking with no assessment step**. *(REQ-FIRST-003)*
- **AT-FIRST-003** — *Probe-and-descend, strong student:* a learner correct on every foundational
  probe answers **~3** foundational questions, not the whole closure. *(REQ-FIRST-004)*
- **AT-FIRST-004** — *Probe-and-descend, injected gap:* a learner failing a Grade-4 fractions probe
  triggers **descent into that node's prerequisites**, and the result names the floor.
  *(REQ-FIRST-004)*
- **AT-FIRST-005** — The **≈25-question cap** is never exceeded, even on a deep closure.
  *(REQ-FIRST-004)*
- **AT-FIRST-006** — A written plan is producible from **session notes alone** in the no-assessment
  mode. *(REQ-FIRST-007)*

> AT-FIRST-003/004/005 run as **pure-logic tests over a fixture prerequisite graph** — no database
> needed for the traversal itself.

## Money

- **AT-BILLING-001 [live]** — A completed checkout credits the wallet **exactly once**, in exactly
  the right amount. *(S6)*
- **AT-BILLING-002 [live]** — **Webhook redelivery of the same event is a no-op.** *(NFR-REL-001)*
- **AT-BILLING-003** — An unsigned or wrongly-signed webhook call is rejected. *(NFR-SEC-004)*
- **AT-CREDIT-001** — Balance equals Σ ledger deltas after an arbitrary sequence of purchases,
  spends, and refunds. *(REQ-CREDIT-002)*
- **AT-CREDIT-002** — A spend that would drive the balance negative **fails**, and writes nothing.
  *(REQ-CREDIT-004)*

## Booking

- **AT-BOOK-001** — Booking spends **exactly one credit** and reserves the slot. *(S7)*
- **AT-BOOK-002 [live]** — **Concurrency:** two simultaneous bookings of one slot yield **exactly
  one** booking and **exactly one** credit spent. *(NFR-REL-002)*
- **AT-BOOK-003** — Slots inside **24h**, or beyond **4 weeks**, are not bookable. *(REQ-BOOK-002)*
- **AT-BOOK-004** — Cancel at **24h+** returns the credit; cancel inside 24h burns it. Tested **at
  the boundary**. *(REQ-BOOK-003)*
- **AT-BOOK-005** — Reschedule at 24h+ moves the slot and leaves the balance **unchanged** — no
  refund/respend pair appears in the ledger. *(REQ-BOOK-004)*
- **AT-BOOK-006 [live]** — **An injected Google Calendar failure leaves a valid booking** with a null
  `meet_url`, which appears on the admin queue. The booking is **not** rolled back. *(S10,
  NFR-REL-003)*
- **AT-BOOK-007** — A slot booked from a non-local time zone lands at the correct **absolute
  instant**, including across a DST boundary. *(spec/14 §12)*
- **AT-BOOK-008** — A no-show burns the credit; an **approved** credit-return request writes
  **exactly one** ledger row and is audited. *(REQ-BOOK-005)*
- **AT-NOTIFY-001** — Confirmation and 24h/1h reminders send; **cron reruns produce no duplicates**.
  *(REQ-NOTIFY-001)*

## Admin & ops

- **AT-ADMIN-001** — The availability template plus exceptions produces the expected slots, **across
  a DST boundary**. *(REQ-ADMIN-001)*
- **AT-ADMIN-002** — The SMS queue lists upcoming sessions ordered by urgency with time remaining;
  sent-marking persists. *(REQ-ADMIN-004)*
- **AT-ADMIN-003** — Every admin ledger adjustment and credit-return decision writes an
  `audit_log` row. *(NFR-OPS-002)*
- **AT-OPS-001** — Launch checklist verified: remote migrations applied, live Stripe products match
  the pricing config, Resend DNS verified, ToS/Privacy/refund pages published, analytics enabled,
  apex DNS cut over. *(NFR-OPS-003)*
- **AT-OPS-002** — The pricing config matches `spec/14` §11 exactly — a silent price drift **fails
  CI**. *(TASK-CONFIG-001)*

---

## Status

**Passing today (30 tests):** AT-CONTENT-004, AT-ROADMAP-001/002/003, AT-PRACTICE-001/002, and
AT-PRACTICE-003 against a local stack.

**Everything else is unwritten** — those features are unbuilt.
