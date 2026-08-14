# 12 — Implementation Plan

Status: **REWRITTEN 2026-08-14** against `spec/14_GROUND_TRUTH_INTERVIEW.md` + ADR-003 + ADR-004. Small,
ordered tasks. Each cites what it satisfies, its dependencies, expected files, and a definition of
done (DoD). A task is **ready** only when everything it references exists; **done** per AGENTS.md
(impl + tests passing + acceptance behavior + contracts + coverage matrix + STATUS).

Global DoD addendum for every task: relevant unit/integration tests pass; referenced `AT-*` behavior
holds; `13_COVERAGE_MATRIX.md` and `STATUS.md` updated.

> **Read first:** the launch scope is in spec/14 §13. **Course content is free** (ADR-004) — there
> is no paywall, lesson pages stay fully static, and authoring gates nothing. The **critical path is
> credits + booking** (spec/14 §11): it gates diagnosis and carries essentially all revenue.

---

## M0 — Scaffold — **COMPLETE**

- **TASK-PROJECT-001 — App scaffold.** Done 2026-07-10.
- **TASK-PROJECT-002 — Supabase wiring + env.** Done 2026-07-10.

## M1 — Public content surface — **COMPLETE (pipeline)**

- **TASK-CONTENT-001 — MDX pipeline + lesson pages.** Done 2026-07-10.
- **TASK-PRACTICE-001 — Questions + answer checking (anonymous).** Done 2026-07-11.
- **TASK-ROADMAP-001 — Public skill-tree map (`/roadmap`).** Done 2026-08-14 (commit `9447849`).
- ~~TASK-CONTENT-002 — author the full slice~~ → **moved post-launch**, see M7.

## M2 — Paper: close out the pivot — **IN PROGRESS**

- **TASK-SPEC-001 — ADR-003 + pricing/ops in spec/14.** Done 2026-08-14.
- **TASK-SPEC-002 — Rewrite `01_PRD.md`** against spec/14. Supersede: 45-min unit (C4),
  Parent/Dependent shapes (C3, §2), OQ1. **Note CON6 (free content is the funnel) is restored by
  ADR-004** — the PRD's free-content premise is correct again; what changed is that the funnel now
  leads to diagnosis and credits, not a course sale. DoD: no statement in the PRD contradicts
  spec/14.
- **TASK-SPEC-003 — Ripple the rewrite.** Update `03_REQUIREMENTS` (new REQ ids for profiles,
  progress, diagnosis), `04_ACTORS` (Buyer / Learner Profile / Admin-Tutor), `05_FLOWS` (purchase,
  booking, diagnosis), `07_DATA_MODEL`, `11_ACCEPTANCE_TESTS`, `13_COVERAGE_MATRIX`. Deps:
  SPEC-002. DoD: coverage matrix has no dangling refs.
- **TASK-SPEC-004 — Rebuild the layered doc tree** from spec/14 (`docs/` currently holds only the
  v1 archive). Deps: SPEC-003.

## M3 — Landing + accounts

- **TASK-LAND-001 — Landing page.** Hero + two paid offers (diagnosis, credits) alongside the free
  content; **primary CTA "Book a Math Diagnosis"**,
  secondary "explore the roadmap". Prices read from the pricing config, never retyped in copy. Deps:
  ROADMAP-001, CONFIG-001. Files: `src/app/page.tsx`. DoD: both CTAs land correctly; prices match
  config; Lighthouse clean.
- **TASK-CONFIG-001 — Pricing config module.** Single source for the five prices — four credit
  packs + diagnosis (spec/14 §11, as amended by ADR-004) — plus
  Stripe price-id mapping. Deps: none. Files: `src/lib/pricing.ts`. DoD: one test asserts config
  matches spec/14 §11 exactly, so a silent price drift fails CI.
- **TASK-AUTH-001 — Google OAuth + magic link.** No passwords, no reset flow. Deps: PROJECT-002.
  Files: `src/app/(auth)/*`, `src/lib/auth/*`. DoD: sign in/out via both methods; identity linking
  when the same email arrives via both.
- **TASK-ACCT-001 — Buyer account + learner profiles.** `accounts` (the buyer/owner) and
  `learner_profiles` beneath it, switchable, no credentials. **Owner identity stays separate from
  learner identity** so a future profile→login upgrade is additive (ADR-003). RLS: a buyer reaches
  only their own profiles. Deps: AUTH-001. Files: `supabase/migrations/*profiles*`,
  `src/lib/accounts/*`. DoD: profile CRUD + switching; cross-account read denied under test.

## M4 — Money — **critical path**

- **TASK-CREDIT-001 — Ledger + balance + spend RPC.** `credit_ledger` (balance = Σdelta),
  `credit_packs` seeded from CONFIG-001, and a `SECURITY DEFINER` spend path enforcing a
  non-negative balance. **Credits never expire.** Deps: ACCT-001, CONFIG-001. DoD: balance correct;
  direct client writes denied; negative balance impossible under concurrent spend.
- **TASK-BILLING-001 — Stripe checkout + idempotent webhook.** `createCheckout` for both SKU
  families (credit packs, diagnosis); `/api/webhooks/stripe` with signature verification, `process_purchase`, and a
  `stripe_events` table so redelivery is a no-op. Deps: CREDIT-001. DoD: purchase credits the
  ledger exactly once under redelivery. Two SKU families only — credits and diagnosis (ADR-004).
- **TASK-BILLING-002 — Wallet UI.** Balance, purchase entry points, order history. Deps:
  BILLING-001. DoD: buyer sees balance and can start any purchase.
- ~~TASK-ENTITLE-001 — Course entitlement + paywall skeleton.~~ **REMOVED by ADR-004** — content is
  free, so there is no entitlement table, no gating, no buy prompts, and no course Stripe product.
  Lesson pages stay **fully static**. Replaced by TASK-PROGRESS-001 in M5.

## M5 — Progress + booking

- **TASK-PROGRESS-001 — Saved progress ("sign in to save your progress").** `question_attempts` +
  `lesson_progress` per **learner profile**; recorded on submit when signed in, ignored when
  anonymous so lesson pages stay static and anonymous practice keeps working. This is the **lead
  capture that replaced the paywall** (ADR-004). Deps: ACCT-001, PRACTICE-001. DoD: progress
  persists across sessions and profile switches; RLS denies cross-account reads; **an anonymous
  visitor can still read every lesson and answer every question**.

- **TASK-AVAIL-001 — Recurring availability + exceptions.** Weekly template plus one-off blackouts
  and extra slots; slots materialized in **UTC**. No tutor dimension (solo — ADR-003). Deps:
  ACCT-001. DoD: template generates correct slots across a DST boundary.
- **TASK-BOOK-001 — Atomic booking RPC.** `book_session`: row-lock the slot, verify it is open,
  spend one credit, reserve — all in one transaction (reuse v1's reserve-slot pattern, CON1/CON2).
  Deps: CREDIT-001, AVAIL-001. DoD: concurrency test — two simultaneous bookings of one slot yield
  exactly one booking and exactly one credit spent.
- **TASK-BOOK-002 — Cancellation (24h rule).** `cancel_booking`: reopen the slot; refund the credit
  **iff ≥24h ahead**, otherwise burn it. Cancels the Calendar event. Deps: BOOK-001. DoD: both
  branches tested at the boundary.
- **TASK-BOOK-003 — Google Calendar + Meet.** Create the event and unique Meet link **after** the
  booking transaction commits; invite both parties. **Must be resilient**: a Google failure leaves a
  valid booking with a missing link, surfaced for manual repair — it never rolls back the booking.
  Deps: BOOK-001. DoD: booking survives an injected Google failure; missing link appears on the
  admin queue.
- **TASK-NOTIFY-001 — Resend email + reminder cron.** Confirmation, reminder, receipt. Cron at 24h
  and 1h with idempotent sent-flags. Deps: BOOK-001. DoD: no duplicate sends across cron reruns.
- **TASK-BOOK-004 — Booking UI.** Slot picker in the visitor's browser time zone, confirmation,
  upcoming/past sessions. Deps: BOOK-001. DoD: a slot booked from a non-local time zone lands at the
  correct absolute instant.

## M6 — Admin + diagnosis

- **TASK-ADMIN-001 — Admin surfaces.** Availability editor, bookings calendar, user/profile list,
  question CRUD, and the **credit-adjustment action** that pairs with manual Stripe refunds so the
  ledger can't drift (ADR-003). All actions audited. Deps: BOOK-001, CREDIT-001. DoD: non-admin
  access denied under test; every adjustment audited.
- **TASK-ADMIN-002 — SMS reminder queue.** A worklist page: per upcoming session, the message to
  send, the recipient's number, and time remaining ("send this to X in 3h 20m"). **Not an
  integration** — the operator sends texts personally. Deps: BOOK-001. DoD: ordering by urgency;
  sent-marking persists.
- **TASK-DIAG-001 — Diagnosis flow.** Purchase the $49 SKU → online placement assessment on the
  **existing practice-question engine** with questions **tagged to roadmap node ids** → 60-min
  session → PDF report + study guide. Deps: BILLING-001, BOOK-001, PRACTICE-001. DoD: assessment
  results identify weak roadmap nodes; the booking is linked to the diagnosis purchase.
- **TASK-DIAG-002 — PDF report + study guide.** Generated deliverables; the guide may go **beyond**
  catalog content (spec/14 §2). Deps: DIAG-001. DoD: a report renders from real assessment results.

## M7 — Launch + post-launch content

- **TASK-OPS-001 — Launch checklist.** Apply migration `0002_questions.sql` + `seed.sql` to the
  **remote** Supabase projects (verified locally only — needs the dev project's DB password);
  Lighthouse/CWV lab run on a Vercel preview; live-mode Stripe products created from CONFIG-001;
  Resend domain DNS verification; **apex DNS cutover from the v1 SAT demo** (closes OQ3); backups
  and audit logging confirmed. DoD: every box ticked; money paths tested end-to-end with real cards.
- **TASK-WORKSHEET-001 — Printable worksheets.** Generated from each lesson's question bank, so they
  stay in sync automatically. No separate authoring, and free like the rest of the content. Deps:
  CONTENT-001. *(May ship post-launch.)*
- **TASK-CONTENT-002 — Author "Math up to Geometry".** The long pole, deliberately **after** launch
  and gating nothing (ADR-004) — a partial free catalog is honest, and every lesson added is new
  indexable SEO surface. Pure content work: write `content/<node-id>.mdx` + seed questions; the
  pages already exist. Runs continuously.

---

## Dependency order (summary)

```
M2:  SPEC-002 → SPEC-003 → SPEC-004                    (paper; parallel to M3)
M3:  CONFIG-001 → LAND-001
     AUTH-001 → ACCT-001
M4:  {ACCT-001, CONFIG-001} → CREDIT-001 → BILLING-001 → BILLING-002
M5:  {ACCT-001, PRACTICE-001} → PROGRESS-001
     ACCT-001 → AVAIL-001 → BOOK-001 → {BOOK-002, BOOK-003, BOOK-004, NOTIFY-001}
     BOOK-001 also needs CREDIT-001
M6:  {BOOK-001, CREDIT-001} → {ADMIN-001, ADMIN-002}
     {BILLING-001, BOOK-001, PRACTICE-001} → DIAG-001 → DIAG-002
M7:  everything → OPS-001 → launch → CONTENT-002 (continuous)
```

**No open blockers.** D2 (pack tiers) is closed by ADR-003. OQ3 (domain) is decided — apex cutover,
now a checklist item. CON3/OQ2 (minors' consent) is **deferred, not resolved**: it returns only if
learner profiles ever become real logins.
