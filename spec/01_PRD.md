# 01 — Product Requirements Document (PRD)

Status: **DRAFT — awaiting sign-off** · Product: Provable Learning v2 · Level: product,
high-level (no implementation detail — those live in `03_REQUIREMENTS.md` onward).

## 1. Product purpose

A free, open **math-learning website** that doubles as the funnel for **paid, credit-based
1:1 tutoring**. Anyone can read lessons and attempt practice questions with no account.
Logged-in learners save their progress. Parents (and standalone adult learners) buy one-time
**credit packs** and spend credits to book **45-minute 1:1 sessions** with the tutor.

This replaces the frozen v1 SAT tutoring ops platform. It is a pivot in product model
(subscription enrollment → free content + pay-per-credit tutoring), reusing v1's proven
technical patterns rather than rewriting them.

**Point of view (from the business-truth review).** The engine is **real 1:1 tutoring income**
from a modest number of committed students (paid per-session in credits). The growth bet is a
**welcoming, structured, ground-up math path** that earns **cold organic-search traffic**, some
of which converts to paid tutoring. The trajectory is **lean and solo now, architected to grow**
(more courses/subjects, possibly more tutors) later. Six-month success = **the platform is live
and correct, the first course is up, and the first students are paying for sessions.**

## 2. Target users

Three customer types plus the operator (and anonymous visitors):

- **Independent Student** — a self-paying student (typically an older teen or adult) with their
  own account: studies, owns credits, books their own 1:1 sessions.
- **Dependent Student** — a student whose account is linked to and paid for by a **Parent**; has
  their own login to study and track progress, and attends sessions the Parent booked.
- **Parent** — pays for and manages one or more Dependent Students; owns the credit wallet and
  books sessions for a chosen dependent. Does not study.
- **Admin-Tutor (the operator, solo — you)** — authors all content, holds the availability
  calendar, and delivers all 1:1 tutoring.
- **Visitor** — anonymous; reads all free content and attempts questions, with no saved state.

Full actor definitions (permissions, states) are in `04_ACTORS.md`.

## 3. User problems

- **P1** People across a wide band of relationships to math — *"math was never my thing," "I
  don't know where to start," "I'm taking a class and need supplementary material," "I want to
  deepen my understanding"* — lack **one welcoming, structured place to learn math from the
  ground up, for free.** Existing free resources (scattered videos/articles) don't provide a
  single guided path.
- **P2** Parents of Dependent Students want structured help — and optional targeted 1:1 —
  **without locking into a monthly subscription.**
- **P3** The operator needs the free, structured content to **draw cold organic/search traffic
  and convert some of it into paid 1:1 tutoring.**

## 4. Product value & differentiation

- **The wedge: a curated, structured path.** Course → Theme → Lesson, in order, from the ground
  up — a single guided sequence, not a scattered pile of videos. This is the differentiator vs
  Khan Academy / YouTube.
- **Welcoming positioning.** Built for the math-anxious and beginners first ("math was never
  your thing"), while still serving supplementary learners (supporting a class) and
  depth-seekers.
- **Free + open + discoverable is the acquisition engine.** Cold organic search is the primary
  channel (not existing network); the free content is simultaneously the product's core value
  *and* the funnel to paid tutoring. Login only adds saved progress.
- **Credits, not subscriptions** — one-time purchases lower commitment vs v1's monthly model.
  1:1 human tutoring is the **monetization layer, not the headline differentiator.**
- **Proven foundations** — reuse of v1's atomic money/booking discipline reduces correctness risk.

## 5. Major capabilities (launch)

- **C1 — Open course content.** Public catalog → theme → lesson (math prose + rendered
  formulas). No account required to read.
- **C2 — Practice & progress.** Practice questions with answer checking; attempts and
  lesson-completion progress saved for logged-in learners.
- **C3 — Accounts.** Two account shapes: (a) a **Parent** who manages one or more **Dependent
  Students**, each with their own login; (b) an **Independent Student** who is their own payer.
  Dependent Student accounts must be linked to a consenting Parent before full use.
- **C4 — Credit packs.** One-time purchase of credit packs; balance held on the payer (parent
  or adult). 1 credit = one 45-minute session.
- **C5 — 1:1 booking.** The payer spends 1 credit to book a 45-minute 1:1 session against the
  tutor's availability; for a Parent, the session is booked for a chosen Dependent Student.
  Session reminders are sent.

## 6. Scope

**In scope (launch):** C1–C5 above; the first course **"Math up to Geometry"**.

**Course roadmap** (ship one at a time, structure identical): Math up to Geometry (launch) →
Pre-Calculus → Calculus.

**Named future capabilities (not designed now):**
- **Group lectures** — live scheduled sessions with credit-gated seat booking.
- Later courses (Pre-Calculus, Calculus).

## 7. Exclusions

Explicitly **out of scope** for this PRD:
- **AI Math Tutor / "Pro" tier** — subscriptions, RAG over content, AI gating. *(Future,
  its own PRD.)*
- **Multiple tutors** — a tutor roster, per-tutor availability, matching. Tutoring is solo.
- Group lectures at launch (named future capability, see §6).
- All v1-only machinery: monthly enrollment, classes/slots, waitlists, 3-phase drop,
  session-date math, Google Classroom provisioning.

## 8. Success criteria

Launch is a **solo, pre-audience release**, so success is a **ship-quality / correctness
gate**, not growth numbers. The product is a success at launch when, end-to-end and verified:

- **S1** Public course content renders correctly, including mathematical formulas, with no
  account.
- **S2** Practice-question answer checking is accurate for every supported question type.
- **S3** A logged-in learner's attempts and lesson progress persist and reload correctly.
- **S4** Account shapes work: a Parent can create/link a consenting Dependent Student (who can
  log in), and an Independent Student can self-register.
- **S5** A credit-pack purchase credits the payer's balance **exactly once** and exactly the
  right amount (no double-credit, no lost purchase).
- **S6** Booking a 1:1 session **spends exactly one credit atomically** and **never
  double-books** a time slot under concurrency.
- **S7** Session reminders are delivered.
- **S8** Authorization holds: users see only their own (and, for parents, their children's)
  data; content questions are readable by all.

Growth/revenue metrics (visitors, conversion rate, sessions/month) are tracked but are **not**
launch success gates.

## 9. Major constraints

- **CON1 — Reuse, don't rewrite.** Port v1's patterns: atomic credit-spend and
  seat/slot-reservation Postgres RPCs (`SECURITY DEFINER` + `FOR UPDATE`), Supabase auth +
  Google OAuth + RLS, Stripe, email/SMS notifications, the navy/gold + Inter UI system.
- **CON2 — Correctness-critical writes stay in RPCs.** Credit spend and booking reservation
  execute in `SECURITY DEFINER` Postgres functions with row locks; never as unguarded
  client-issued writes. (Backs S5, S6.)
- **CON3 — Minor accounts / consent.** Child learners are minors with their own logins. The
  chosen direction is a **parent-consent gate**: a child account must be linked to a consenting
  parent before full use. Legal/consent detail (COPPA/age-of-consent handling) is resolved in
  the **auth ADR** before any child-account code is written.
- **CON4 — Payments are one-time.** No subscriptions at launch (Stripe one-time purchases only).
- **CON5 — Solo operator.** One person is both tutor and admin; no multi-tutor abstractions.
- **CON6 — Organic search is the acquisition channel.** Free content is the primary way learners
  find the product (cold search, not existing network). Lessons must be **publicly crawlable,
  server-rendered, and fast** — SEO and content performance are launch concerns, formalized as
  `NFR-PERF-*` at the requirements stage. This raises the stakes on the free content (P3, §4).

## 10. Open items (resolve before the milestone that needs them)

- **OQ1 — Credit-pack tiers.** Base is 4 credits / $300; the 8/12/16 (or chosen) tiers and
  their per-credit discount curve must be set before creating Stripe products. *(Needed at the
  billing stage, not for this PRD.)*
- **OQ2 — COPPA/consent mechanics.** Direction is set (CON3); exact consent flow is an auth ADR.
- **OQ3 — Domain cutover.** The apex domain is reserved for v2; repoint DNS from the v1 demo
  when the launch build is ready.

## 11. Downstream dependencies

This PRD drives, in order: `03_REQUIREMENTS.md` (turns C1–C5, S1–S8, CON1–CON5 into `REQ-*`/
`NFR-*`), then `04_ACTORS.md`, `05_FLOWS.md`, and the rest of the tree. Changing any decision
here propagates down per the change-propagation rules in `../AGENTS.md`.
