# 02 — Glossary

Status: **REWRITTEN 2026-08-14** against `14_GROUND_TRUTH_INTERVIEW.md` + ADR-003/004/005.

One term per concept. If a word appears in code, a migration, or UI copy, it is defined here.

---

## People

- **Buyer** — the one authenticated human per account. Owns the wallet, the bookings, and the
  learner profiles. Usually a parent; may be the student.
- **Learner profile** — a switchable profile under a buyer's account (`name`, `grade`,
  `current math class`). **Has no credentials and cannot log in.** Not an account.
- **Independent student** — the case where the buyer and the learner are the same person. Not a
  separate actor: the buyer simply has a profile representing themselves.
- **Admin-Tutor** — the operator. Solo. Authors content, holds availability, delivers every session.
  **No tutor entity exists in the schema** (ADR-003).
- **Visitor** — anonymous. Reads every lesson and attempts every question; saves nothing.

## Products

- **First Session** — the $49 entry SKU: a discounted first 60-minute session (vs $75 for a single
  credit), **one per customer, enforced**, shaped to a **goal** stated at purchase. *(Renamed from
  "Math Diagnosis" by ADR-005 — that name presumed something was wrong and excluded the
  getting-ahead and test-prep buyers.)*
- **Goal** — what the buyer says they want, chosen at First Session checkout. One of
  **`strengths`** · **`test_prep`** · **`class_help`**. The goal selects the **mode**.
- **Mode** — the shape the First Session takes, determined by the goal. Decides **whether there is a
  pre-session assessment at all**: `class_help` has none.
- **Credit** — the unit of paid tutoring. **1 credit = one 60-minute 1:1 session.** Credits **never
  expire**.
- **Credit pack** — a one-time purchase of 1, 2, 4, or 8 credits ($75 / $120 / $200 / $350).

> **Course content is not a product.** It is free and public (ADR-004). There is no course SKU, no
> paywall, and no entitlement.

## Content

- **Roadmap** — `roadmap/roadmap.json`, the **single source of truth for curriculum structure**
  (ADR-002), rendered as the public skill tree at `/roadmap`.
- **Node** — an entry in the roadmap. A **lesson** if it has a `number`; otherwise a **concept**
  (a container with no page of its own).
- **Course node** — a node marked as a selectable class ("Algebra 1", "Geometry") so a learner can
  name what they're taking now (ADR-005).
- **Slug** — a node's `id`. The **global join key** between roadmap structure, `content/<id>.mdx`,
  and the `questions` table.
- **Prerequisite closure** — the transitive set of nodes a given node depends on. What the
  strengths assessment walks.
- **Coming soon** — how a lesson node with no authored file renders. Never a 404 — the map doubles
  as the authoring to-do list.

## Assessment

- **Probe-and-descend** — the strengths-mode algorithm: one **probe** per major node in the
  prerequisite closure, foundational first; a **correct** probe marks that subtree solid and skips
  it; a **wrong** probe **descends** into that node's prerequisites to find the floor; 2–3 questions
  near the current class; **hard cap ≈25 questions**.
- **Probe** — a single question standing in for a whole subtree.
- **Floor** — the deepest node where the learner actually fails. What the written plan is built from.
- **Written plan** — the post-session deliverable, sent **within 48 hours**. A copy commitment, not
  enforced in code.

## Money & booking

- **Ledger** — `credit_ledger`, append-only. **Balance = Σ deltas**, never a stored counter.
- **Spend** — the −1 ledger row written atomically inside the booking RPC.
- **Slot** — a bookable 60-minute window derived from the recurring weekly **availability template**
  plus **exceptions** (blackouts and extras). Stored **UTC**, displayed in the visitor's zone.
- **24-hour rule** — one number governing three things: minimum booking notice, free cancellation,
  and free rescheduling.
- **Reschedule** — moving a booking to another open slot at 24h+. **Does not touch the ledger** —
  deliberately not a cancel-and-rebook round trip.
- **No-show** — 15+ minutes late. The credit burns, but the buyer may file a **credit-return
  request** for the operator to approve or deny.
- **Admin adjustment** — the manual ledger write that pairs with a manual Stripe refund, so wallet
  and Stripe cannot drift. There are **no self-serve refunds**.
- **SMS reminder queue** — the operator's manual worklist of texts to send. **A worklist, not an
  integration** — the system itself sends email only.

## Retired vocabulary

| Don't say | Say |
|---|---|
| Math Diagnosis | **First Session** (ADR-005) |
| Dependent Student / Parent / Independent Student | **Buyer** + **learner profile** (ADR-003) |
| Learner *(as an account)* | **Learner profile** — it is not an account |
| Paywall · entitlement · sample lesson | *(nothing — content is free, ADR-004)* |
| 45-minute session | **60-minute session** |
| Course purchase | *(nothing — there is no course SKU)* |
| Tutor *(as an entity)* | **Admin-Tutor**, the solo operator |
