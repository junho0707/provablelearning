# 11 — Acceptance Tests

Status: **DRAFT** · Observable Given/When/Then tests that prove requirements and flows. Each
references the requirement(s) and flow(s) it verifies and the PRD success gate it backs. These
are defined **before** the corresponding implementation task is considered ready (AGENTS.md).
Automated-test mapping is tracked in `13_COVERAGE_MATRIX.md`.

Categories covered: happy path, authorization, validation, failure, boundary, concurrency,
idempotency.

---

## Content & SEO

- **AT-CONTENT-001** (happy, S1) — *Given* a published lesson, *when* a Visitor with no account
  opens its URL, *then* the explanation, examples, and math notation render, server-side (present
  in initial HTML). Ref REQ-CONTENT-003/004, NFR-PERF-001, FLOW-CONTENT-001.
- **AT-CONTENT-002** (boundary) — *Given* an unknown lesson slug, *when* opened, *then* a 404
  with links back into the Learning Path. Ref REQ-CONTENT-002.
- **AT-CONTENT-003** (SEO) — *Given* any content page, *when* fetched, *then* it exposes title/
  description/canonical metadata and appears in the sitemap. Ref NFR-PERF-003.

## Practice & progress

- **AT-PRACTICE-001** (happy, S2) — *Given* an MCQ, *when* the correct choice is submitted,
  *then* it is marked correct with explanation; *when* a wrong choice, marked incorrect. Ref
  REQ-PRACTICE-003.
- **AT-PRACTICE-002** (boundary, S2) — *Given* a numeric question with tolerance, *when* a value
  within tolerance is submitted, *then* correct; just outside, incorrect. Ref REQ-PRACTICE-003.
- **AT-PRACTICE-003** (validation) — *Given* a numeric question, *when* non-numeric input is
  submitted, *then* a validation error and no attempt recorded. Ref REQ-PRACTICE-003.
- **AT-PRACTICE-004** (free-response) — *Given* a free-response question, *when* the learner
  reveals, *then* the worked solution shows and no correct/incorrect is stored. Ref
  REQ-PRACTICE-001 (D1).
- **AT-PRACTICE-005** (security) — *Given* an auto-checkable question served to a Visitor, *when*
  the page/DOM is inspected, *then* the correct answer is not exposed client-side. Ref
  NFR-SEC-001.
- **AT-PROGRESS-001** (happy, S3) — *Given* a logged-in Student who attempted questions and
  completed a lesson, *when* they log out and back in, *then* attempts and progress reload. Ref
  REQ-PROGRESS-001/002/003.
- **AT-PROGRESS-002** (authz, S8) — *Given* a Parent, *when* they view a linked dependent's
  progress, *then* it is visible; *when* they request a non-linked student's progress, *then*
  denied. Ref REQ-PROGRESS-004, NFR-SEC-001.

## Accounts *(final assertions pending ADR-002)*

- **AT-ACCT-001** (happy, S4) — *Given* a Visitor, *when* they self-register, *then* an
  `independent_student` with full learner access is created. Ref REQ-ACCT-002.
- **AT-ACCT-002** (happy, S4) — *Given* a Parent, *when* they create a dependent and grant
  consent, *then* the dependent can log in and study. Ref REQ-ACCT-003/004.
- **AT-ACCT-003** (failure) — *Given* a dependent already linked to Parent A, *when* Parent B
  tries to link the same account, *then* it is rejected. Ref REQ-ACCT-007.
- **AT-ACCT-004** (boundary) — *Given* a dependent in `pending` consent, *when* they log in,
  *then* only the pre-consent state is available. Ref REQ-ACCT-004.

## Billing (S5)

- **AT-BILLING-001** (happy, S5) — *Given* a Payer, *when* a credit-pack checkout completes and
  the webhook fires, *then* exactly the pack's credits are added (one `purchase` row). Ref
  REQ-BILLING-002, FLOW-BILLING-001.
- **AT-BILLING-002** (idempotency, S5) — *Given* a completed purchase, *when* Stripe redelivers
  the same event, *then* the balance does not change (no double-credit). Ref REQ-BILLING-002,
  INV-7, NFR-REL-001.
- **AT-BILLING-003** (failure) — *Given* an abandoned/declined checkout, *when* no completion
  event arrives, *then* no credits and no ledger row. Ref FLOW-BILLING-001.
- **AT-BILLING-004** (security) — *Given* a webhook POST with an invalid signature, *when*
  received, *then* it is rejected and no credit occurs. Ref NFR-SEC-004.

## Booking (S6)

- **AT-BOOK-001** (happy, S6) — *Given* a Payer with balance ≥ 1 and an open slot, *when* they
  book, *then* the slot becomes booked, exactly 1 credit is spent, a Session with a Meet link is
  created, and a confirmation is sent. Ref REQ-BOOK-002, REQ-CREDIT-003, REQ-NOTIFY-002.
- **AT-BOOK-002** (concurrency, S6) — *Given* two Payers booking the same slot simultaneously,
  *when* both submit, *then* exactly one succeeds and the other gets 409 with no credit spent.
  Ref REQ-BOOK-003, NFR-REL-002, INV-3/4.
- **AT-BOOK-003** (failure, S6) — *Given* a Payer with 0 credits, *when* they attempt to book,
  *then* 402 and no reservation. Ref REQ-CREDIT-003.
- **AT-BOOK-004** (authz) — *Given* a Parent, *when* they book with an attendee who is not their
  dependent, *then* 403. Ref REQ-BOOK-004, INV-6.
- **AT-BOOK-005** (boundary, D4) — *Given* a booked Session >24h away, *when* cancelled, *then*
  the credit is refunded and the slot reopens; *given* one <24h away, *when* cancelled, *then*
  the credit is forfeit and the slot reopens. Ref REQ-BOOK-005.
- **AT-BOOK-006** (resilience) — *Given* booking succeeds but the Calendar/Meet call fails,
  *when* it errors, *then* the Session and spend still persist (booking not lost). Ref
  FLOW-BOOK-001 failure boundary.

## Notifications (S7)

- **AT-NOTIFY-001** (happy, S7) — *Given* a Session ~24h and ~1h away, *when* the reminder cron
  runs, *then* the attendee (and Parent, for a dependent) receive email reminders. Ref
  REQ-NOTIFY-001.
- **AT-NOTIFY-002** (idempotency) — *Given* reminders already sent, *when* the cron runs again,
  *then* no duplicate reminder. Ref REQ-NOTIFY-001, FLOW-NOTIFY-001.

## Authorization (S8, cross-cutting)

- **AT-SEC-001** (authz, S8) — *Given* Student A, *when* they request Student B's attempts/
  credits/bookings, *then* denied by RLS. Ref NFR-SEC-001.
- **AT-SEC-002** (authz) — *Given* a non-admin, *when* they call an admin contract (refund,
  availability, user list), *then* denied. Ref NFR-SEC-001, REQ-AUTH-005.
- **AT-SEC-003** (invariant) — *Given* any attempt to write `credit_ledger`/`bookings` directly
  (not via RPC), *when* issued as a normal user, *then* denied. Ref NFR-SEC-002.
