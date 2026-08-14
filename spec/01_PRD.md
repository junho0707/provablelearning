# 01 — Product Requirements Document (PRD)

Status: **REWRITTEN 2026-08-14** against `14_GROUND_TRUTH_INTERVIEW.md` + ADR-003/004/005 ·
Product: Provable Learning v2 · Level: product, high-level (no implementation detail — those live
in `03_REQUIREMENTS.md` onward).

> `spec/14` remains the ground truth. This PRD is its product-level expression; where they ever
> disagree, spec/14 wins.

## 1. Product purpose

A **free, open math-learning website** — the whole K–12 arc, Elementary through Calculus, laid out
as a navigable **skill-tree roadmap** — that funnels into **paid 1:1 tutoring**.

Everything readable is free and requires no account. Signing in adds saved progress. Money comes
from two one-time purchases: a **$49 First Session** (the entry offer) and **credit packs** for
60-minute 1:1 sessions thereafter.

This replaces the frozen v1 SAT tutoring platform, reusing v1's proven money/booking patterns rather
than rewriting them.

**Point of view.** The engine is **real 1:1 tutoring income** from a modest number of committed
students. Free content and the $49 First Session are both **acquisition**, priced at or near
breakeven on purpose; **credit packs carry essentially all revenue** (spec/14 §11). The growth bet
is that a structured, ground-up math path earns **cold organic-search traffic**, some of which
converts. Lean and solo now, architected to grow later.

## 2. Target users

- **Buyer** — one login, owns the wallet, the bookings, and the learner profiles beneath it.
  Usually a parent; may be the student.
- **Learner profile** — a switchable profile under a buyer's account holding **name, grade, and
  current math class**. **No credentials** — a profile is not a login. An **independent student**
  is the case where buyer and learner are the same person; this is supported, not an edge case.
- **Admin-Tutor (the operator, solo)** — authors all content, holds the availability calendar, and
  delivers every session.
- **Visitor** — anonymous; reads every lesson and attempts every question, with no saved state.

Full actor definitions are in `04_ACTORS.md`.

## 3. User problems

- **P1** People across a wide band of relationships to math lack **one welcoming, structured place
  to learn it from the ground up, for free** — and, critically, lack any way to see *where they are*
  and *what comes next*. Scattered videos don't give you a map.
- **P2** Families want targeted 1:1 help **without a monthly subscription**, and without committing
  hundreds of dollars before knowing whether it helps.
- **P3** The operator needs the free content to **draw cold organic search** and convert a fraction
  of it into paid tutoring.

## 4. Product value & differentiation

- **The wedge is the roadmap.** A visual skill tree over the whole K–12 arc, showing prerequisites
  and position. This — not lesson volume — is the differentiator versus Khan Academy and YouTube,
  which have far more content and no map. It also works *better* the more of it is free and
  clickable (ADR-004).
- **Free, open, discoverable is the acquisition engine.** The entire lesson catalog is public and
  statically rendered; the indexable surface grows with every lesson authored.
- **A low-risk way in.** The $49 First Session (vs $75 for a single credit, one per customer) lets a
  family try real tutoring before committing to a pack.
- **Serves three goals with one product.** Catching up, getting ahead, and test prep are all valid
  reasons to book — the First Session adapts to the goal the buyer states (ADR-005).
- **Credits, not subscriptions.** One-time purchases; credits never expire.
- **Proven foundations.** Reuse of v1's atomic money/booking discipline reduces correctness risk.

**Positioning rule (binding on all copy):** frame everything as **strengths and next steps, never
deficits**. No "diagnosis", "behind", "struggling", or "what's wrong" language. Deficit framing makes
parents defensive, gives teenagers a reason to refuse the assessment, and wrongly excludes the
accelerating and test-prep buyers who are half the market (spec/14 §14).

## 5. Major capabilities (launch)

- **C1 — Free open content.** Every authored lesson public: prose, rendered formulas, worked
  examples, practice questions, solutions. No account, no paywall, statically rendered.
- **C2 — The roadmap.** A pan/zoom skill tree over the full K–12 arc with prerequisites, unbuilt
  regions marked "coming soon", and a collapsible outline on mobile.
- **C3 — Practice & saved progress.** Answer checking for all question types, anonymous or signed
  in. Signed-in attempts and completion save per learner profile. **A lesson is complete only when
  every practice question has been answered correctly.**
- **C4 — Accounts.** One buyer login (Google OAuth or email magic link, **no passwords**) with
  switchable learner profiles beneath it. No child credentials, therefore no consent gate.
- **C5 — First Session ($49, one per customer).** A discounted first 60-minute session shaped to a
  goal stated at purchase, with a **mode-dependent** pre-session assessment and a written plan
  delivered within 48 hours.
- **C6 — Credit packs & booking.** One-time packs (1/2/4/8 credits); 1 credit = one 60-minute
  session. Book against the tutor's availability; 24h minimum notice; free reschedule or cancel at
  24h+; Google Meet link per booking; email confirmations and reminders.
- **C7 — Admin operations.** Availability editor, bookings calendar, question CRUD, credit
  adjustments, the no-show credit-return request queue, and the **manual SMS reminder worklist**.

## 6. Scope

**In scope (launch):** C1–C7, on the **apex domain**, **US only**, USD.

**The roadmap ships as the full arc** (Elementary → Calculus) with unbuilt regions locked.

**Deliberately deferred: authoring the content itself.** Because content is free, a partial catalog
is honest rather than an under-delivery, so authoring **gates nothing** and continues after launch
(ADR-004). Every lesson added is new indexable surface.

**Named future capabilities (not designed now):** group lectures; multiple tutors; charging for
content; an AI tutor tier.

## 7. Exclusions

- **AI Math Tutor / "Pro" tier** — subscriptions, RAG over content. *(Future, its own PRD.)*
- **Multiple tutors** — no tutor roster, no per-tutor availability, no matching. Solo only
  (ADR-003); adding a second tutor is a known future migration.
- **Paid content** — no paywall, no entitlements, no course SKU (ADR-004).
- **Self-serve refunds** — refunds are manual in Stripe, paired with an admin ledger adjustment.
- **SMS integration** — SMS is a manual worklist, not an integration.
- All v1-only machinery: monthly enrollment, classes/slots, waitlists, 3-phase drop, Google
  Classroom provisioning.

## 8. Success criteria

Launch is a **solo, pre-audience release**, so success is a **ship-quality / correctness gate**, not
growth numbers. The product succeeds at launch when, end-to-end and verified:

- **S1** Every authored lesson renders correctly, formulas included, with no account.
- **S2** The roadmap renders the full arc, marks unbuilt regions, and works on mobile.
- **S3** Answer checking is accurate for every supported question type, anonymous or signed in.
- **S4** A signed-in learner's attempts and completion persist per profile and reload correctly.
- **S5** Accounts work: a buyer signs in via Google or magic link and manages learner profiles;
  cross-account reads are denied.
- **S6** A purchase credits the wallet (or grants the First Session) **exactly once** and in exactly
  the right amount, including on webhook redelivery.
- **S7** Booking **spends exactly one credit atomically** and **never double-books** a slot under
  concurrency. Cancel/reschedule honor the 24h rule; a reschedule leaves the ledger untouched.
- **S8** A second First Session purchase by the same customer is refused.
- **S9** Confirmations and reminders are delivered, with no duplicates across cron reruns.
- **S10** A booking survives a Google Calendar failure — the session stands, the missing link
  surfaces for manual repair.
- **S11** Authorization holds: buyers see only their own data; question answers never reach the
  client.

**Post-launch, the number that matters** is the **First Session → credit-pack conversion rate**
(spec/14 §11). It is not a launch gate, but the model has no second leg without it.

## 9. Major constraints

- **CON1 — Reuse, don't rewrite.** Port v1's atomic credit-spend and slot-reservation Postgres RPCs
  (`SECURITY DEFINER` + `FOR UPDATE`), Supabase auth + RLS, Stripe, the navy/gold + Inter UI system.
- **CON2 — Correctness-critical writes stay in RPCs.** Credit spend and slot reservation run in
  `SECURITY DEFINER` functions with row locks, never as unguarded client writes. (Backs S6, S7.)
- **CON3 — Minors' consent: deferred, not resolved.** Learner profiles carry **no credentials**, so
  no consent gate is needed at launch. It returns only if profiles ever become real logins —
  therefore **owner identity stays separate from learner identity** so that upgrade is additive.
- **CON4 — Payments are one-time.** No subscriptions (Stripe one-time purchases only).
- **CON5 — Solo operator.** One person is tutor and admin; no multi-tutor abstractions.
- **CON6 — Organic search is the acquisition channel.** Free content is the primary way learners
  find the product. Lessons must be **publicly crawlable, statically rendered, and fast** — no
  per-user gating on content pages. Formalized as `NFR-PERF-*`.
  *(Restored by ADR-004 after spec/14 briefly retired it; the funnel now leads to the First Session
  and credits, not a course sale.)*
- **CON7 — US only.** USD, US tax/Stripe setup, availability in the operator's own hours.

## 10. Open items

- **OQ2 — COPPA/consent mechanics.** **Deferred** by CON3; revisit only if profiles become logins.
- **Known risk (accepted) — the near-empty map.** With ~20 lessons against a K–12 arc, the launch
  roadmap reads ~5% built and can look like vaporware. **Mitigation is framing, not scope**: present
  growth as a feature ("new lessons weekly") and make authored regions visually prominent.
- **Known limitation (accepted) — analytics.** Vercel Analytics + Stripe cannot report the First
  Session → credit-pack conversion rate; it must be reconstructed by hand from Stripe until PostHog
  is adopted (spec/14 §17).

*OQ1 (pack tiers) closed by ADR-003. OQ3 (domain) closed — apex cutover, now a launch-checklist
item.*

## 11. Downstream dependencies

This PRD drives `03_REQUIREMENTS.md` (turns C1–C7, S1–S11, CON1–CON7 into `REQ-*`/`NFR-*`), then
`04_ACTORS.md`, `05_FLOWS.md`, and the rest of the tree. Changing any decision here propagates down
per the change-propagation rules in `../AGENTS.md` — and any change to what is sold, the access
model, or pricing also requires updating `spec/14` **and** writing an ADR.
