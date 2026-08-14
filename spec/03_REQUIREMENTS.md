# 03 — Requirements

Status: **REWRITTEN 2026-08-14** against `01_PRD.md` (C1–C7, S1–S11, CON1–CON7) +
`14_GROUND_TRUTH_INTERVIEW.md` + ADR-003/004/005.

Each `REQ-*` traces to a PRD capability; each `NFR-*` to a constraint or success criterion.
Acceptance behavior is in `11_ACCEPTANCE_TESTS.md`.

> **Withdrawn by ADR-004:** all `REQ-ENTITLE-*` / paywall requirements. Content is free.

---

## Content (C1)

- **REQ-CONTENT-001** — Every authored lesson is readable **in full by an anonymous visitor**: prose,
  rendered math, worked examples, practice questions, solutions.
- **REQ-CONTENT-002** — Lesson structure comes from `roadmap/roadmap.json`; prose from
  `content/<node-id>.mdx` (ADR-002). The node id is the global slug and the join key to questions.
- **REQ-CONTENT-003** — A lesson node with no authored file renders as **"coming soon"**, never a
  404 — the map doubles as the authoring to-do list.
- **REQ-CONTENT-004** — Every lesson page is **statically generated**, carries SEO metadata
  (title, description, canonical), and appears in `sitemap.xml`. **No per-user gating may be added
  to content pages** (CON6, ADR-004).

## Roadmap (C2)

- **REQ-ROADMAP-001** — The roadmap renders the **full K–12 arc** (Elementary → Calculus) as a
  pan/zoom skill tree, with **containment** and **prerequisite** edges visually distinguished.
- **REQ-ROADMAP-002** — Unbuilt regions render as **locked / "coming soon"**, inherited by
  descendants.
- **REQ-ROADMAP-003** — Selecting a node shows its detail (description, prerequisites, link to the
  lesson) and highlights its **transitive prerequisite chain**.
- **REQ-ROADMAP-004** — On small screens the same data renders as a **collapsible nested outline**.
- **REQ-ROADMAP-005** — Nodes may be marked as **selectable courses** ("Algebra 1", "Geometry") so a
  learner can name the class they are currently taking (ADR-005).
- **REQ-ROADMAP-006** — The public map and the signed-in progress view are **two distinct surfaces**,
  not one map with an overlay (spec/14 §7).

## Practice & progress (C3)

- **REQ-PRACTICE-001** — Question types: **mcq** (exact match), **numeric** (within tolerance),
  **free** (reveal, no grade).
- **REQ-PRACTICE-002** — Answer checking happens **server-side**. Answers, tolerances, and
  explanations **never reach the client** before submission.
- **REQ-PRACTICE-003** — Malformed input (e.g. non-numeric for a numeric question) is rejected with
  a clear message, not a crash or a false "incorrect".
- **REQ-PRACTICE-004** — **Anonymous visitors may attempt every question** and receive feedback.
  Nothing is recorded.
- **REQ-PROGRESS-001** — When signed in, each attempt is recorded against the **active learner
  profile**.
- **REQ-PROGRESS-002** — A lesson is **complete only when every one of its practice questions has
  been answered correctly** (spec/14 §16).
- **REQ-PROGRESS-003** — Progress persists across sessions and profile switches, and is visible per
  profile.

## Accounts (C4)

- **REQ-AUTH-001** — Sign-in via **Google OAuth** or **email magic link**. **No passwords**, and
  therefore no reset flow (ADR-003).
- **REQ-AUTH-002** — The same email arriving via both methods resolves to **one** account.
- **REQ-ACCT-001** — A buyer creates, edits, switches, and deletes **learner profiles** holding
  `name`, `grade`, `current math class`.
- **REQ-ACCT-002** — Learner profiles have **no credentials** and cannot sign in.
- **REQ-ACCT-003** — Buyer and learner may be the **same person** (independent student); no flow may
  assume otherwise.
- **REQ-ACCT-004** — Owner identity and learner identity are **separate records** so a future
  profile→login upgrade is additive (CON3).

## First Session (C5)

- **REQ-FIRST-001** — The First Session SKU costs **$49** and is **limited to one per customer**,
  **enforced** — a second purchase attempt is refused (S8).
- **REQ-FIRST-002** — The buyer **states a goal at purchase**: `strengths` · `test_prep` ·
  `class_help`. The goal selects the mode.
- **REQ-FIRST-003** — The pre-session assessment is **conditional on mode**:
  `strengths` → roadmap-derived assessment · `test_prep` → an authored practice test for that test ·
  **`class_help` → no assessment at all**, route straight to booking (ADR-005).
- **REQ-FIRST-004** — *(strengths mode)* Questions are drawn from the **transitive prerequisite
  closure** of the learner's `current_course_node`, using **probe and descend**: one probe per major
  node, foundational first; a correct probe marks that subtree solid and **skips it**; a wrong probe
  **descends** into that node's prerequisites; 2–3 questions near the current class; **hard cap ≈25
  questions**.
- **REQ-FIRST-005** — The assessment is set up by the buyer (who picks the profile and goal) and
  **completed by the student alone, before the session** (spec/14 §6).
- **REQ-FIRST-006** — A **written plan** is delivered **within 48 hours** of the session. This is a
  copy commitment, **not enforced in code**.
- **REQ-FIRST-007** — The plan must be producible in the **no-assessment mode** too, from session
  notes alone.

## Credits & booking (C6)

- **REQ-CREDIT-001** — Credit packs: **1/$75 · 2/$120 · 4/$200 · 8/$350**. 1 credit = one
  **60-minute** session.
- **REQ-CREDIT-002** — Balance is **Σ ledger deltas**, never a stored counter.
- **REQ-CREDIT-003** — **Credits never expire.**
- **REQ-CREDIT-004** — Balance may **never go negative**; enforced inside the spend RPC under row
  lock (CON2).
- **REQ-BILLING-001** — Checkout via Stripe for both SKU families (First Session, credit packs).
- **REQ-BILLING-002** — The webhook is **idempotent**: redelivery credits nothing twice (S6).
- **REQ-BILLING-003** — **No self-serve refunds.** Refunds are manual in Stripe, paired with an
  **admin ledger adjustment** so wallet and Stripe cannot drift (ADR-003).
- **REQ-BOOK-001** — Booking **spends exactly one credit and reserves the slot in one transaction**
  with row locks; a slot never double-books under concurrency (S7, CON2).
- **REQ-BOOK-002** — **24-hour minimum notice**; **4-week** booking horizon.
- **REQ-BOOK-003** — **Cancel**: free at **24h+**, credit returned; later, credit burns.
- **REQ-BOOK-004** — **Reschedule** (distinct from cancel): free at **24h+**, moves the slot and
  **leaves the ledger untouched** — not a cancel-and-rebook round trip.
- **REQ-BOOK-005** — **No-show** = 15 minutes late; the credit burns. The buyer may **submit a
  credit-return request**, which the operator approves or denies. Approval writes **exactly one**
  ledger row.
- **REQ-BOOK-006** — A **Google Meet link is generated per booking** via the Calendar API **after
  the booking transaction commits**. A Google failure **must not** roll back the booking; the missing
  link surfaces on the admin queue (S10).
- **REQ-NOTIFY-001** — Email via **Resend**: booking confirmation, receipt, and reminders at **24h**
  and **1h**, with idempotent sent-flags (no duplicates across cron reruns).
- **REQ-NOTIFY-002** — **The system sends email only.** SMS is manual (REQ-ADMIN-004).

## Admin (C7)

- **REQ-ADMIN-001** — Edit the **recurring weekly availability template** plus blackout/extra
  exceptions.
- **REQ-ADMIN-002** — View all bookings; mark **completed** or **no-show**.
- **REQ-ADMIN-003** — **Adjust the credit ledger** and **approve/deny credit-return requests**.
  Every such action is **audited**.
- **REQ-ADMIN-004** — A **manual SMS reminder queue**: per upcoming session, the message to send,
  the recipient's number, and time remaining. **A worklist, not an integration.**
- **REQ-ADMIN-005** — CRUD practice questions.
- **REQ-ADMIN-006** — Surface bookings with a **missing Meet link** for manual repair.

---

## Non-functional

- **NFR-SEC-001** — RLS: a buyer reads only their own account, profiles, ledger, bookings, progress.
- **NFR-SEC-002** — Money and booking writes execute **only** in `SECURITY DEFINER` RPCs; direct
  client writes are denied (CON2).
- **NFR-SEC-003** — Question `answer` / `tolerance` / `explanation` are withheld from `anon` and
  `authenticated` by **column-level grants**; only the service role reads them.
- **NFR-SEC-004** — The Stripe webhook **verifies signatures** and rejects unsigned calls.
- **NFR-PERF-001** — Content and roadmap pages are **statically generated**.
- **NFR-PERF-002** — Core Web Vitals verified in a **lab run on a deployed preview** before launch.
- **NFR-PERF-003** — Lessons are crawlable and in the sitemap; **no gating may be introduced** on
  content pages (CON6).
- **NFR-REL-001** — Purchase processing is idempotent (S6).
- **NFR-REL-002** — Booking is atomic under concurrency (S7).
- **NFR-REL-003** — External-service failure (Google, Resend) **degrades gracefully** and never
  rolls back committed money or bookings.
- **NFR-OPS-001** — Backups scheduled and verified.
- **NFR-OPS-002** — All money/booking actions written to `audit_log`.
- **NFR-OPS-003** — Launch checklist complete: remote migrations applied, live Stripe products,
  Resend DNS verified, **ToS / Privacy / refund policy pages published**, Vercel Analytics enabled,
  **apex DNS cut over**.
- **NFR-LEGAL-001** — US-only; USD (CON7).

## Traceability

| PRD | Requirements |
|---|---|
| C1 | REQ-CONTENT-001..004 |
| C2 | REQ-ROADMAP-001..006 |
| C3 | REQ-PRACTICE-001..004, REQ-PROGRESS-001..003 |
| C4 | REQ-AUTH-001..002, REQ-ACCT-001..004 |
| C5 | REQ-FIRST-001..007 |
| C6 | REQ-CREDIT-001..004, REQ-BILLING-001..003, REQ-BOOK-001..006, REQ-NOTIFY-001..002 |
| C7 | REQ-ADMIN-001..006 |
| S1–S11 | see `11_ACCEPTANCE_TESTS.md` |
