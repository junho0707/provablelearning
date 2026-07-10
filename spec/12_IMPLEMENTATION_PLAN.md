# 12 — Implementation Plan

Status: **DRAFT** · Small, ordered tasks. Each cites the requirements, flows, and acceptance
tests it satisfies, its dependencies, expected files, and a definition of done (DoD). A task is
**ready** only when everything it references exists; **done** per AGENTS.md (impl + tests passing
+ acceptance behavior + contracts + coverage matrix + STATUS). Grouped by milestone; ship each
milestone independently.

Global DoD addendum for every task: relevant unit/integration tests pass; referenced `AT-*`
behavior holds; `13_COVERAGE_MATRIX.md` and `STATUS.md` updated.

---

## M0 — Scaffold (no user-facing product yet)

- **TASK-PROJECT-001 — App scaffold.** Objective: fresh Next.js (App Router) + TypeScript strict
  + Tailwind v4 app on `main`, with `content/`, `supabase/`, base layout/nav, and the navy/gold +
  Inter UI tokens ported from v1. Refs: PRD CON1, ARCH §9. Deps: none. Files: `src/app/*`,
  `src/app/globals.css`, `next.config`, `tailwind`. DoD: app builds + runs; landing renders with
  the design system.
- **TASK-PROJECT-002 — Supabase wiring + env.** Objective: Supabase client (server/browser),
  env management, empty migration baseline. Refs: ARCH, DATA_MODEL. Deps: 001. Files:
  `src/lib/supabase/*`, `supabase/migrations/0001_init.sql`. DoD: server can read Supabase; env
  documented.

## M1 — Content (ships the free product — no auth)

- **TASK-CONTENT-001 — MDX pipeline + Learning Path.** Objective: render `content/**` MDX+KaTeX;
  build catalog → course → theme → lesson, server-rendered, with SEO metadata + sitemap. Refs:
  REQ-CONTENT-001..004, NFR-PERF-001..003; ADR-001. AT: AT-CONTENT-001/002/003. Deps: 001. Files:
  `src/app/(content)/*`, `src/lib/content/*`, `content/geometry/**`. DoD: a real lesson is live,
  crawlable, passes AT-CONTENT-*; CWV within NFR-PERF-002 in lab.
- **TASK-CONTENT-002 — Author "Math up to Geometry" (initial slice).** Objective: first theme +
  2–3 lessons authored as MDX (content, not code). Refs: PRD §6. Deps: CONTENT-001. Files:
  `content/geometry/**`. DoD: the initial Learning-Path slice reads end-to-end. *(Content grows
  incrementally after launch.)*
- **TASK-PRACTICE-001 — Questions + answer checking (anonymous).** Objective: `questions` table;
  render MCQ/numeric/free; `checkAnswer` server-side (answers not client-exposed); free-response
  reveal. Refs: REQ-PRACTICE-001/002/003; ADR-001 (slug join). AT: AT-PRACTICE-001..005. Deps:
  PROJECT-002, CONTENT-001. Files: `supabase/migrations/*questions*`, `src/lib/practice/*`,
  `src/app/(content)/.../questions`. DoD: AT-PRACTICE-* pass; slug-integrity check in CI.

## M2 — Accounts, progress *(auth ADR required first)*

- **TASK-ACCT-000 — ADR-002 auth/consent.** Objective: decide the parent-consent gate mechanics
  (COPPA/age-of-consent) and record ADR-002. Refs: CON3, NFR-SEC-003, PRD OQ2. Deps: none.
  **Blocks all other M2 tasks.** DoD: ADR-002 accepted.
- **TASK-AUTH-001 — Auth (email+password, Google, reset).** Refs: REQ-AUTH-001..004. AT:
  AT-ACCT-001. Deps: PROJECT-002. Files: `src/app/(auth)/*`, `src/lib/auth/*`. DoD: sign up/in/
  out/reset work; identity linking; AT-ACCT-001.
- **TASK-ACCT-001 — Roles + parent↔dependent + consent.** Objective: `profiles` (role,
  parent_id, consent), role-immutability trigger, create/link dependent, grant consent, RLS.
  Refs: REQ-ACCT-001..007, NFR-SEC-001/003; ADR-002. AT: AT-ACCT-002/003/004, AT-SEC-001. Deps:
  ACCT-000, AUTH-001. Files: `supabase/migrations/*profiles*`, `src/lib/accounts/*`,
  `src/app/(dashboard)/parent/*`. DoD: AT-ACCT-* + AT-SEC-001 pass.
- **TASK-PROGRESS-001 — Attempts + lesson progress.** Objective: `question_attempts`,
  `lesson_progress`; record on submit when logged in; parent views dependent progress; RLS. Refs:
  REQ-PROGRESS-001..004. AT: AT-PROGRESS-001/002. Deps: ACCT-001, PRACTICE-001. Files:
  `src/lib/progress/*`. DoD: AT-PROGRESS-* pass; progress persists across sessions.

## M3 — Credits & payments (S5)

- **TASK-CREDIT-001 — Ledger + balance + spend RPC.** Objective: `credit_ledger`, `credit_packs`,
  balance = Σdelta, and the `SECURITY DEFINER` spend path (ported `apply_credits`) enforcing
  non-negative balance. Refs: REQ-CREDIT-001..005, NFR-SEC-002; INV-1/2. AT: AT-SEC-003. Deps:
  ACCT-001. Files: `supabase/migrations/*credit*`, `src/lib/credits/*`. DoD: balance correct;
  direct writes denied (AT-SEC-003).
- **TASK-BILLING-001 — Stripe checkout + idempotent webhook.** Objective: `createCheckout`,
  `/api/webhooks/stripe` with signature verify, `process_purchase` + `stripe_events`. Refs:
  REQ-BILLING-001..004, NFR-SEC-004, NFR-REL-001; INV-7. AT: AT-BILLING-001..004. Deps:
  CREDIT-001. Files: `src/lib/stripe/*`, `src/app/api/webhooks/stripe/*`. DoD: AT-BILLING-* pass
  (incl. redelivery no-op). **D2 (pack tiers) must be resolved to seed `credit_packs`.**
- **TASK-BILLING-002 — Balance UI.** Objective: wallet/balance + purchase entry points for
  payers. Refs: REQ-CREDIT-001, REQ-BILLING-001. Deps: BILLING-001. Files:
  `src/app/(dashboard)/*`. DoD: payer sees balance; can start a purchase.

## M4 — 1:1 booking (S6)

- **TASK-BOOK-001 — Availability + atomic book RPC.** Objective: `availability_slots`, admin
  publish/close, `book_session` RPC (lock + check + spend + reserve in one tx), booking UI. Refs:
  REQ-BOOK-001/002/003/004, REQ-CREDIT-003, NFR-REL-002; INV-3/4/6. AT: AT-BOOK-001/002/003/004,
  AT-SEC-003. Deps: CREDIT-001, BILLING-001. Files: `supabase/migrations/*booking*`,
  `src/lib/booking/*`, `src/app/(dashboard)/*`, admin availability. DoD: AT-BOOK-001..004 pass
  incl. the concurrency test.
- **TASK-BOOK-002 — Google Calendar + Meet + confirmation.** Objective: create Calendar event +
  Meet link post-commit; confirmation email; resilient to Google failure. Refs: REQ-BOOK-006,
  REQ-NOTIFY-002; ADR-001 n/a. AT: AT-BOOK-006. Deps: BOOK-001, TASK-NOTIFY-001. Files:
  `src/lib/booking/google.ts`, `src/lib/notifications/*`. DoD: AT-BOOK-006 (booking survives
  Google failure).
- **TASK-BOOK-003 — Cancellation (24h rule).** Objective: `cancel_booking` RPC (reopen slot;
  refund iff ≥24h), UI, Calendar cancel. Refs: REQ-BOOK-005; INV-1/2. AT: AT-BOOK-005. Deps:
  BOOK-001. DoD: AT-BOOK-005 both branches.
- **TASK-NOTIFY-001 — Email + reminder cron.** Objective: transactional email; `/api/cron/
  session-reminders` at 24h/1h, idempotent flags. Refs: REQ-NOTIFY-001/002. AT: AT-NOTIFY-001/002.
  Deps: BOOK-001. Files: `src/lib/notifications/*`, `src/app/api/cron/*`. DoD: AT-NOTIFY-* pass.

## M5 — Admin & launch hardening

- **TASK-ADMIN-001 — Admin surfaces.** Objective: question CRUD, availability, calendar of
  bookings, refunds (`refund_credit` + audit), user list. Refs: REQ-BILLING-005, REQ-BOOK-001/006,
  NFR-OPS-002. AT: AT-SEC-002. Deps: BOOK-001, CREDIT-001. Files: `src/app/(dashboard)/admin/*`.
  DoD: AT-SEC-002; refunds audited.
- **TASK-OPS-001 — Backups + audit + launch checks.** Objective: backup schedule, audit logging
  wired for all money/booking actions, domain cutover checklist (PRD OQ3). Refs: NFR-OPS-001..003.
  Deps: prior M5. DoD: backups run; audit complete; cutover checklist ready.

---

## Dependency order (summary)

```
M0: PROJECT-001 → PROJECT-002
M1: CONTENT-001 → {CONTENT-002, PRACTICE-001}
M2: ACCT-000(ADR-002) → AUTH-001 → ACCT-001 → PROGRESS-001
M3: CREDIT-001 → BILLING-001 → BILLING-002
M4: (CREDIT/BILLING) → BOOK-001 → {BOOK-002, BOOK-003, NOTIFY-001}
M5: ADMIN-001 → OPS-001
```

Ship M1 to the public first (free, useful, SEO-able). Money/booking (M3/M4) come after content is
live. Open blockers: **ADR-002** (before M2), **D2 pack tiers** (before BILLING-001 seed).
