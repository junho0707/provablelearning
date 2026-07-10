# 05 — Flows

Status: **DRAFT** · End-to-end actor behavior. Each flow has a stable ID and cites the
requirements it exercises. Failure and alternative paths are explicit, never hidden inside the
main path. Actors are defined in `04_ACTORS.md`.

Coverage note: this file details the **core launch arcs**. Routine Admin-Tutor CRUD (authoring a
lesson, editing a question) follows the standard create/edit/publish pattern and is captured at
the design stage rather than as separate flows here.

---

## FLOW-AUTH-001 — Independent Student sign-up

- **Actor:** Visitor → Independent Student
- **Purpose:** create a self-paying account with saved progress.
- **Preconditions:** not authenticated.
- **Trigger:** submits sign-up (email+password) or chooses Google.
- **Main flow:** provide email+password (or Google OAuth) → account created with role
  `independent_student` → session established → land on dashboard.
- **Alternatives:** Google identity with an email matching an existing account → link, don't
  duplicate (REQ-AUTH-002).
- **Failures:** email already registered → prompt login/reset; weak/invalid input → validation
  error; OAuth cancelled → return to sign-up unchanged.
- **Postconditions:** authenticated Independent Student with an empty wallet and no progress.
- **Requirements:** REQ-AUTH-001/002/003, REQ-ACCT-001/002.

## FLOW-AUTH-002 — Login / logout

- **Actor:** any registered user
- **Main flow:** email+password or Google → session established → role-appropriate dashboard.
  Logout ends the session.
- **Failures:** bad credentials → error, no session; unverified/blocked → message.
- **Requirements:** REQ-AUTH-001/002/003.

## FLOW-AUTH-003 — Password reset

- **Actor:** registered user (email accounts)
- **Main flow:** request reset → email link sent → set new password → may log in.
- **Failures:** unknown email → generic success message (no account enumeration); expired link →
  ask to restart.
- **Requirements:** REQ-AUTH-004, NFR-SEC (no enumeration).

## FLOW-ACCT-001 — Parent adds & links a Dependent Student (consent gate)

- **Actor:** Parent
- **Purpose:** give a child their own login while satisfying the parent-consent gate.
- **Preconditions:** authenticated Parent.
- **Trigger:** "Add student".
- **Main flow:** Parent provides the dependent's details/email → a `dependent_student` account is
  created/invited **linked to this Parent** → Parent records consent → dependent moves to
  `active` and can log in and study.
- **Alternatives:** the dependent's email already has an account → link flow instead of create
  (exact mechanics per the auth ADR).
- **Failures:** dependent already linked to another Parent → blocked (REQ-ACCT-007); consent not
  completed → dependent stays `pending_consent` with the pre-consent state only.
- **Postconditions:** Parent has one more linked, consented Dependent Student.
- **Requirements:** REQ-ACCT-003/004/005/007, CON3, NFR-SEC-003. *(Blocked on the auth ADR for
  exact consent mechanics.)*

## FLOW-ACCT-002 — Dependent Student first login

- **Actor:** Dependent Student
- **Main flow:** logs in → if `active`, full study experience with saved progress; if
  `pending_consent`, limited pre-consent state with a prompt explaining a Parent must consent.
- **Requirements:** REQ-ACCT-004, REQ-PROGRESS-001..003.

## FLOW-CONTENT-001 — Browse the Learning Path & read a Lesson

- **Actor:** Visitor (or any Student)
- **Purpose:** the core free experience and SEO surface.
- **Preconditions:** none.
- **Trigger:** lands on a catalog/course/lesson URL (often from search).
- **Main flow:** catalog lists Courses → Course shows ordered Themes → Theme shows ordered
  Lessons → Lesson renders explanation + examples with math notation. Pages are server-rendered
  and crawlable.
- **Alternatives:** logged-in Student sees their completion state along the path.
- **Failures:** unknown slug → 404 with links back into the path.
- **Postconditions:** none for a Visitor; for a Student, viewing may mark lesson progress
  (per REQ-PROGRESS-002 rule).
- **Requirements:** REQ-CONTENT-001..004, NFR-PERF-001/002/003.

## FLOW-PRACTICE-001 — Attempt a practice Question

- **Actor:** Visitor or logged-in Student
- **Preconditions:** on a Lesson with Questions.
- **Trigger:** submits an answer (MCQ/numeric) or reveals a free-response solution.
- **Main flow (auto-checkable):** submit → system checks (exact-match choice / numeric within
  tolerance) → shows correct/incorrect + explanation. If logged in, the Attempt is recorded.
  Free-response is handled by the reveal-and-self-assess path below.
- **Main flow (free-response):** attempt → reveal worked solution → learner self-assesses; no
  correct/incorrect is stored.
- **Alternatives:** Visitor (not logged in) → same feedback, nothing saved.
- **Failures:** malformed numeric input → validation, no attempt recorded; save failure while
  logged in → surfaced, retryable, feedback still shown.
- **Postconditions:** logged-in Student has a new Attempt (auto-checkable types) and possibly
  updated Progress.
- **Requirements:** REQ-PRACTICE-001/002/003, REQ-PROGRESS-001/003, S2, S3.

## FLOW-BILLING-001 — Buy a Credit Pack

- **Actor:** Payer (Parent or Independent Student)
- **Purpose:** add credits to the wallet.
- **Preconditions:** authenticated Payer.
- **Trigger:** selects a Credit Pack → Checkout.
- **Main flow:** create a Stripe one-time Checkout for the chosen pack → Payer pays on Stripe →
  Stripe sends a signature-verified webhook → system **idempotently** writes one `purchase`
  ledger entry for exactly the pack's credits → balance updates → confirmation shown.
- **Alternatives:** Payer returns to the app before the webhook lands → balance shows pending/
  updates once the webhook is processed (webhook is the source of truth, not the redirect).
- **Failures:**
  - Payment declined/abandoned → no ledger entry, no credits.
  - **Duplicate webhook delivery** → detected via the event/idempotency key → **no double-credit**
    (REQ-BILLING-002).
  - Webhook missed then retried by Stripe → still credited exactly once.
  - Invalid signature → rejected, ignored (NFR-SEC-004).
- **Postconditions:** ledger has exactly one `purchase` entry per successful payment; balance =
  sum of ledger.
- **Requirements:** REQ-BILLING-001/002, REQ-CREDIT-001/005, NFR-SEC-004, NFR-REL-001, S5.

## FLOW-BOOK-001 — Book a 1:1 Session

- **Actor:** Payer (Parent for a Dependent Student, or Independent Student for self)
- **Purpose:** spend a credit to reserve a 45-min session.
- **Preconditions:** authenticated Payer with balance ≥ 1; ≥1 open Availability slot; if Parent,
  ≥1 linked dependent.
- **Trigger:** selects an open slot (and, if Parent, an attendee dependent) → Confirm.
- **Main flow:** a single `SECURITY DEFINER` RPC, under a `FOR UPDATE` lock on the slot, verifies
  the slot is still open and the balance ≥ 1, then **atomically** reserves the slot and writes a
  `spend` ledger entry (−1) → creates the Session → creates a Google Calendar event + Meet link →
  sends a booking confirmation (with the Meet link) → the Session appears on the Payer's/attendee's
  and Admin-Tutor's views.
- **Alternatives:** Parent picks which dependent attends (REQ-BOOK-004).
- **Failures:**
  - **Slot taken concurrently** → the losing request's RPC sees the slot no longer open → rolls
    back (no spend), told to pick another slot (REQ-BOOK-003, S6).
  - **Insufficient balance** → RPC aborts before spend → prompt to buy a pack.
  - Google Calendar/Meet call fails → Session + spend still committed; Meet link created on
    retry / added by the reminder; booking is never lost because of the calendar step.
  - Confirmation email fails → booking stands; reminder cron still fires.
- **Postconditions:** one Session; exactly one `spend`; the slot is no longer bookable; balance
  decreased by exactly 1.
- **Requirements:** REQ-BOOK-002/003/004/006, REQ-CREDIT-002/003, NFR-SEC-002, NFR-REL-002,
  REQ-NOTIFY-002, S6.

## FLOW-BOOK-002 — Cancel a 1:1 Session

- **Actor:** Payer
- **Trigger:** cancels an upcoming Session.
- **Main flow:** if **≥24h** before start → write a `refund` ledger entry (+1) and reopen the
  slot; if **<24h** before → forfeit the credit (no refund) and reopen the slot. Cancel the
  Calendar event; notify attendee/parent.
- **Failures:** session already started/passed → cannot cancel; concurrent cancel → idempotent
  (one refund at most).
- **Postconditions:** slot reopened; credit refunded only if ≥24h; Calendar event removed.
- **Requirements:** REQ-BOOK-005, REQ-CREDIT-001/005, REQ-NOTIFY.

## FLOW-NOTIFY-001 — Session reminders

- **Actor:** system (scheduled)
- **Trigger:** cron runs on a schedule.
- **Main flow:** find Sessions starting in ~24h and ~1h without that reminder sent → send email
  to the attendee (and Parent if the attendee is a Dependent Student) → mark reminder sent
  (idempotent; no duplicate reminder).
- **Failures:** email send fails → retried next run; already-sent guard prevents duplicates.
- **Requirements:** REQ-NOTIFY-001, S7, NFR-REL.

## FLOW-ADMIN-001 — Publish Availability

- **Actor:** Admin-Tutor
- **Main flow:** define bookable slots (times) → they become bookable by Payers.
- **Failures:** overlapping slots / slot in the past → validation.
- **Requirements:** REQ-BOOK-001.

## FLOW-ADMIN-002 — Issue a refund/adjustment

- **Actor:** Admin-Tutor
- **Main flow:** select a Payer → write a `refund` ledger entry with a reason → balance updates →
  action is audit-logged.
- **Failures:** none beyond validation; ledger stays append-only (correction = new entry).
- **Requirements:** REQ-BILLING-005, REQ-CREDIT-005, NFR-OPS-002.

## FLOW-ADMIN-003 — Author content & questions

- **Actor:** Admin-Tutor
- **Main flow:** author/edit a Course/Theme/Lesson (explanation + examples) and its Questions
  (type, answer, explanation, order) → publish → appears on the public Learning Path.
- **Requirements:** REQ-CONTENT-001..005, REQ-PRACTICE-001.

---

## Flow ↔ actor ↔ requirement summary

| Flow | Actor | Key requirements | Success gate |
|---|---|---|---|
| AUTH-001..003 | Visitor/Student | REQ-AUTH-* | S4 |
| ACCT-001/002 | Parent, Dep. Student | REQ-ACCT-*, CON3 | S4, S8 |
| CONTENT-001 | Visitor/Student | REQ-CONTENT-*, NFR-PERF-* | S1 |
| PRACTICE-001 | Visitor/Student | REQ-PRACTICE-*, REQ-PROGRESS-* | S2, S3 |
| BILLING-001 | Payer | REQ-BILLING-*, NFR-REL-001 | S5 |
| BOOK-001 | Payer | REQ-BOOK-*, REQ-CREDIT-003, NFR-REL-002 | S6 |
| BOOK-002 | Payer | REQ-BOOK-005 | — |
| NOTIFY-001 | system | REQ-NOTIFY-001 | S7 |
| ADMIN-001/002/003 | Admin-Tutor | REQ-BOOK-001, REQ-BILLING-005, REQ-CONTENT-* | S8 |
