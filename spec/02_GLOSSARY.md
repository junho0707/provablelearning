# 02 — Glossary

Canonical terms for Provable Learning v2. Every artifact uses these exactly. If two words
could mean the same thing, only one is canonical here; the other is listed as "avoid".

Status: **DRAFT** — grows as requirements/flows introduce terms.

## Actors

- **Visitor** — an unauthenticated person browsing the site. Can read all free content and
  attempt questions; no saved state.
- **Student** — a person who studies. Two kinds: **Dependent Student** and **Independent Student**.
- **Dependent Student** — a student whose account is linked to and paid for by a consenting
  **Parent**. Has their own login to study and track progress; attends Parent-booked sessions.
  Does **not** buy credits or book. (Typically a minor — see the parent-consent gate.)
- **Independent Student** — a self-paying student who is their own payer: studies, owns credits,
  and books their own sessions. (Parent + Student collapsed into one person.)
- **Parent** — an account that pays for and manages one or more Dependent Students. Owns the
  credit wallet and books sessions for a chosen dependent. Does not study.
- **Admin-Tutor** — the solo operator (one person, = the site owner). Authors content, holds the
  availability calendar, delivers all 1:1 sessions, manages users, and sees all data. "Tutor"
  and "Admin" are the same actor in v2.
- **Payer** — role, not a separate account: whoever owns a credit balance (a Parent, or an
  Independent Student).

## Content

- **Course** — a top-level math subject shipped as a unit (e.g. "Math up to Geometry").
- **Theme** — a grouping of related lessons within a Course (e.g. "Triangles").
- **Lesson** — the atomic unit of content within a Theme (e.g. "Pythagorean Theorem"); contains
  explanation and examples, plus its practice Questions.
- **Learning Path** — the ordered Course → Theme → Lesson sequence a Student follows from the
  ground up. The single guided path (vs a scattered pile of content) is the product's core
  differentiator.
- **Question** — a practice item attached to a Lesson; has a type (e.g. multiple-choice,
  numeric, free-response), a correct answer, and an explanation.
- **Attempt** — a Learner's single submission against a Question, recorded with correctness.
- **Progress** — a Learner's completion state for a Lesson (and, by aggregation, a Course).

## Money & tutoring

- **Credit** — the unit of paid tutoring. **1 credit = one 45-minute 1:1 session.**
- **Credit Pack** — a purchasable bundle of Credits at a set price (one-time Stripe purchase).
- **Credit Balance / Wallet** — the Credits a Payer currently holds; the running total of the
  Credit Ledger.
- **Credit Ledger** — the append-only record of Credit changes (purchase, spend, refund) whose
  sum is the Balance.
- **1:1 Session** — a 45-minute tutoring appointment between the Admin-Tutor and one Learner,
  paid for with 1 Credit.
- **Availability** — the time slots the Admin-Tutor offers for booking.
- **Booking** — a reserved 1:1 Session tied to a specific Availability slot and Learner,
  created by spending 1 Credit.
- **Group Lecture** — *(future, not in launch)* a live scheduled session with multiple
  credit-booked seats.

## Avoid / non-canonical

- "Learner" → use **Student** (or Dependent/Independent Student). ("Learner" was an earlier
  draft term, now retired in favor of the user's "Student" vocabulary.)
- "Child Learner" / "Adult Learner" → use **Dependent Student** / **Independent Student**.
- "Enrollment", "Class", "Slot" (v1 subscription terms) → not used in v2; bookings and
  availability replace them.
- "Subscription" → not used at launch (payments are one-time Credit Pack purchases).
