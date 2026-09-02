# L0 — Business

*What the system sells and to whom, in plain language. Source: `spec/01_PRD.md`, `spec/14_GROUND_TRUTH_INTERVIEW.md`, ADR-003/004/005.*

## In one sentence

A **free, open K–12 math site** (Elementary through Calculus, laid out as a navigable skill-tree
roadmap) that funnels into **paid 1:1 tutoring** — the content is the acquisition engine, the
tutoring is the business.

## The money model

Two one-time purchases, no subscription:

1. **First Session — $49, one per customer.** The entry offer: cheaper than a single credit ($75)
   on purpose, so a family can try real 1:1 tutoring before committing to a pack.
2. **Credit packs — 1/$75 · 2/$120 · 4/$200 · 8/$350.** 1 credit = one 60-minute session. Credits
   never expire. **This is where essentially all revenue lives** — the First Session and free
   content are both acquisition, priced near breakeven on purpose.

Everything else (reading lessons, the roadmap, practice questions, signing in, saving progress) is
free, forever, no account required for reading.

## Why free content, not a paywall

A paid course SKU existed briefly (ADR-003) and was withdrawn hours later (ADR-004) for two
reasons: a partly-authored catalog can't meet the delivery obligation a paid SKU implies, and
gating shrinks the indexable surface — which matters because **acquisition is cold organic
search**, not paid ads or an existing audience. The roadmap is the wedge: a visible skill tree over
the whole K–12 arc is the differentiator against content-rich, map-less competitors (Khan Academy,
YouTube), and it works better the more of it is free and clickable. This is treated as close to a
one-way door: charging later means charging for what was free.

## Capabilities (C1–C7)

| | Capability | One line |
|---|---|---|
| C1 | Free open content | Every authored lesson public — prose, math, worked examples, questions, solutions. No account, no paywall, static. |
| C2 | The roadmap | Pan/zoom skill tree, full K–12 arc, prerequisites shown, unbuilt regions read "coming soon" (never 404). |
| C3 | Practice & saved progress | Server-checked answers for everyone; signed-in attempts persist per learner profile. Lesson "complete" = every question answered correctly. |
| C4 | Accounts | One buyer login (Google OAuth or magic link, no passwords) with switchable learner profiles beneath it. |
| C5 | First Session | $49, one per customer, goal-dependent assessment, written plan within 48h. |
| C6 | Credit packs & booking | One-time packs, 24h-notice booking, free reschedule/cancel at 24h+, Meet link per booking, email confirm/remind. |
| C7 | Admin operations | Availability editor, bookings calendar, question CRUD, ledger adjustments, no-show credit-return queue, manual SMS worklist. |

Each capability's requirement IDs, flows, and acceptance tests are indexed in
`spec/13_COVERAGE_MATRIX.md` — that's the audit view; this doc is the "what and why."

## Who it's for

- **Buyer** — usually a parent, sometimes the student. Owns the wallet, bookings, and the learner
  profiles under their account.
- **Learner profile** — the person being taught. Not a login (no credentials). Can be the buyer
  themselves (independent student) — supported deliberately, not an edge case.
- **Admin-Tutor** — one person, solo. Authors content, holds the calendar, delivers every session.
- **Visitor** — anonymous. Reads everything, attempts every question, saves nothing.

Full definitions, permissions, and the actor × capability matrix: `01-context.md` → `spec/04_ACTORS.md`.

## The binding copy rule

**Frame everything as strengths and next steps, never deficits.** No "diagnosis", "behind",
"struggling", or "what's wrong" language anywhere user-facing. Deficit framing makes parents
defensive, gives teenagers a reason to refuse the assessment, and excludes the getting-ahead and
test-prep buyers — who are half the market. This rule shaped the rename of the $49 SKU from "Math
Diagnosis" to "First Session" (ADR-005) and governs the strengths-assessment copy (`journeys/f6-assessment.md`).

## What's explicitly out of scope

No paywall/entitlements, no second tutor, no subscriptions, no SMS integration (a manual worklist
instead), no password auth, no minors'-consent flow (learner profiles hold no credentials, so
nothing to consent to). These are documented as decisions, not gaps, in `02-invariants.md` and
`spec/13_COVERAGE_MATRIX.md`'s "deliberate absences."

## Downstream

`01-context.md` — who uses the system and how (actors, dependencies, journey catalog).
