# 13 — Coverage Matrix

Status: **REWRITTEN 2026-08-14** against ADR-003/004/005. Every capability traced from PRD →
requirement → flow → acceptance test → implementation task, with current build status.

Legend: ✅ built & verified · 🟡 partly built · ⬜ not started

---

## Capability coverage

| PRD | Requirements | Flows | Acceptance | Task | Status |
|---|---|---|---|---|---|
| **C1** Free open content | REQ-CONTENT-001..004 | F1 | AT-CONTENT-001..005 | CONTENT-001 | ✅ |
| **C2** Roadmap | REQ-ROADMAP-001..006 | F2 | AT-ROADMAP-001..004 | ROADMAP-001, **ROADMAP-002** | ✅ |
| **C3** Practice & progress | REQ-PRACTICE-001..004, REQ-PROGRESS-001..003 | F1, F4 | AT-PRACTICE-001..004, AT-PROGRESS-001..002 | PRACTICE-001, **PROGRESS-001** | 🟡 *(practice ✅; progress code-complete, not live-verified)* |
| **C4** Accounts | REQ-AUTH-001..002, REQ-ACCT-001..004 | F3 | AT-ACCT-001..004, AT-SEC-001 | **AUTH-001**, **ACCT-001** | 🟡 *(code-complete: sign-in, profile CRUD + switching, RLS. Not live-verified — no Docker/OAuth-configured Supabase project in this environment)* |
| **C5** First Session | REQ-FIRST-001..007 | F5, F6 | AT-FIRST-001..006 | **FIRST-001..004** | 🟡 *(code-complete: goal routing, probe-and-descend engine (pure-tested, fixture graph), test-prep sets, First Session booking RPC (no credit spend), written-plan renderer. Not live-verified)* |
| **C6** Credits & booking | REQ-CREDIT-001..004, REQ-BILLING-001..003, REQ-BOOK-001..006, REQ-NOTIFY-001..002 | F7, F8, F9, F10 | AT-BILLING-*, AT-CREDIT-*, AT-BOOK-*, AT-NOTIFY-001 | **CONFIG-001**, **CREDIT-001**, **BILLING-001/002**, **AVAIL-001**, **BOOK-001/002/003/004/005**, **NOTIFY-001** | 🟡 *(all of M4+M5 code-complete: ledger, checkout+webhook, wallet, availability derivation, atomic booking, cancel/reschedule, no-show + credit-return, Calendar/Meet, Resend + reminder cron, booking UI. Not live-verified — no Docker/Stripe/Google/Resend in this environment)* |
| **C7** Admin ops | REQ-ADMIN-001..006 | F11, F12, F13 | AT-ADMIN-001..003, AT-SEC-002 | **ADMIN-001**, **ADMIN-002** | 🟡 *(code-complete: availability editor, bookings calendar + missing-link queue, credit-return queue, user list, question CRUD, credit-adjustment, SMS worklist, session-notes/plan page — all admin-gated (`requireAdmin`) + RLS/RPC-enforced. Not live-verified)* |

## Success-criteria coverage

| | Criterion | Acceptance | Status |
|---|---|---|---|
| S1 | Lessons render, no account | AT-CONTENT-001 | ✅ |
| S2 | Roadmap renders full arc, mobile | AT-ROADMAP-001..003 | ✅ |
| S3 | Answer checking accurate | AT-PRACTICE-001/002 | ✅ |
| S4 | Progress persists per profile | AT-PROGRESS-001/002 | 🟡 *(code-complete: `question_attempts`/`lesson_progress`, completion logic pure-tested. Not live-verified)* |
| S5 | Accounts + cross-account denial | AT-ACCT-001..003, AT-SEC-001 | 🟡 *(see C4 row — code-complete, not live-verified)* |
| S6 | Purchase credits exactly once | AT-BILLING-001/002 | 🟡 *(code-complete: idempotent webhook via `stripe_events`, `process_purchase` RPC. Not live-verified — needs a real Stripe account)* |
| S7 | Atomic booking, no double-book | AT-BOOK-001/002, AT-BOOK-004/005 | 🟡 *(code-complete: `book_session` advisory-lock + partial unique index, SQL-text invariant tests. Not live-verified — needs a real Postgres transaction for the concurrency case)* |
| S8 | Second First Session refused | AT-FIRST-001 | 🟡 *(code-complete: `createFirstSessionCheckout` pre-checks + `purchases`'s partial unique index (INV-MONEY-2). Not live-verified)* |
| S9 | Notifications, no duplicates | AT-NOTIFY-001 | 🟡 *(code-complete: `reminded_24h`/`reminded_1h` flags only flip on a successful send. Not live-verified — needs a real Resend account)* |
| S10 | Booking survives Google failure | AT-BOOK-006 | 🟡 *(code-complete: `createCalendarEvent` never throws, `meet_url` stays null on failure — unit-tested with Google mocked. Not live-verified against the real Calendar API)* |
| S11 | Authz holds; answers never leak | AT-SEC-001..003, AT-CONTENT-004 | 🟡 *(answer secrecy ✅; admin gating code-complete via `requireAdmin` + RLS, not live-verified)* |

## Constraint coverage

| Constraint | Where enforced | Status |
|---|---|---|
| CON1 reuse v1 patterns | BOOK-001, CREDIT-001 (ported RPCs) | ⬜ |
| CON2 writes in RPCs | NFR-SEC-002 · AT-SEC-003 | ✅ *(money: `spend_credit`/`process_purchase`; booking: `book_session`/`cancel_booking`/`reschedule_booking`/`mark_no_show`/`resolve_credit_return_request` — no direct client write grant on any of `purchases`, `credit_ledger`, `bookings`, `credit_return_requests`, `audit_log`)* |
| CON3 consent deferred | No child credentials; `accounts` ≠ `learner_profiles` | ✅ *by design* |
| CON4 one-time payments | No subscription code path exists | ✅ *by absence* |
| CON5 solo operator | No tutor entity in `07_DATA_MODEL` | ✅ *by absence* |
| CON6 organic search | NFR-PERF-001/003 · **AT-CONTENT-005** | 🟡 *(guard test unwritten)* |
| CON7 US only | Pricing config USD | ⬜ |

## Invariants

| | Invariant | Enforced by |
|---|---|---|
| INV-ACTOR-1 | Owner identity ≠ learner identity | Separate tables (`07`) |
| INV-MONEY-1 | Balance never negative | `pg_advisory_xact_lock` per account inside `spend_credit` (no row exists to lock in an append-only ledger) |
| INV-MONEY-2 | ≤1 First Session per account | Partial unique index + pre-checkout check |
| INV-MONEY-3 | Webhook redelivery is a no-op | `stripe_events` insert-first, `process_purchase` returns `false` on replay |
| INV-BOOK-1 | ≤1 live booking per slot | `pg_advisory_xact_lock` per slot instant inside `book_session`, backstopped by a partial unique index on `bookings.starts_at` |
| INV-BOOK-2 | `meet_url` nullable by design | Calendar call **after** commit; `createCalendarEvent` returns `null` rather than throwing on any Google failure |

---

## Gaps and known holes

**Deliberate absences** *(not gaps — do not "fix")*: no entitlements table, no paywall, no
`sample` flag (ADR-004); no tutor entity (ADR-003); no self-serve refunds; no SMS integration.

**Real gaps to close:**

1. ~~AT-CONTENT-005 is unwritten~~ **Closed** — `src/lib/content/content-gate.test.ts` guards it.
2. **NFR-PERF-002** — CWV lab run still not done; needs a deployed preview. In `VERIFY.md` §5.
3. **Remote migrations** — `0002_questions.sql` + `seed.sql` verified **locally only**. Until
   applied remotely, `getLessonQuestions` returns `[]` (pages still render — graceful).
4. **Analytics cannot report the conversion rate** the model rests on (spec/14 §17). Accepted;
   PostHog is the upgrade path.
5. **The near-empty map** — ~20 lessons against a K–12 arc. Mitigation is framing, not scope.
6. ~~LAND-001's primary CTA points at `/login`, not a checkout.~~ **Closed** — now points at
   `/wallet`, where a signed-in buyer can start a real First Session checkout (BILLING-001).
7. **AUTH-001 and ACCT-001 are code-complete but not live-verified.** No Docker in this WSL distro
   (no local Supabase stack) and no confirmation the linked project's Auth → Providers → Google is
   configured, so Google OAuth exchange, same-email identity linking, profile CRUD, and RLS
   cross-account denial (AT-SEC-001) could not be exercised end-to-end. Migration `0003_accounts.sql`
   also hasn't been applied anywhere. Verify against a running project before relying on any of it.
8. **CREDIT-001/BILLING-001/BILLING-002 are code-complete but not live-verified.** Same limitation:
   migration `0004_credits.sql` hasn't been applied anywhere, and no real Stripe account/keys exist
   in this environment. `spend_credit`'s advisory-lock concurrency guard and `process_purchase`'s
   idempotency guard are exercised only via SQL-text invariant tests
   (`src/lib/credits/integrity.test.ts`), not against a live Postgres transaction. Checklist added to
   `VERIFY.md` §2.
9. **AVAIL-001/BOOK-001..005/NOTIFY-001 (all of M5) are code-complete but not live-verified.** Same
   limitation, plus two more external dependencies: a real Google account (Calendar/Meet,
   `GOOGLE_REFRESH_TOKEN`) and a real Resend account. The DST-boundary math (`src/lib/booking/slots.ts`)
   and the 24h/4-week windowing are pure-logic tested and trustworthy; what's *not* exercised is the
   live concurrency case (`AT-BOOK-002`, two simultaneous bookings of one slot), the real Calendar
   event/Meet-link creation, and actual email delivery. Checklist added to `VERIFY.md` §3.
10. ~~ADMIN-001's UI is the only thing standing between BOOK-005's RPCs and a usable no-show
    queue.~~ **Closed 2026-08-14** — `/admin/credit-returns`, `/admin/bookings` (with the
    no-show button) now call them.
11. **Two small spec gaps found and closed during M6, not yet reflected in `03_REQUIREMENTS.md`:**
    (a) REQ-ADMIN-004 requires "the recipient's number" for the SMS worklist, but no phone field
    existed anywhere — closed with an optional `accounts.phone`, buyer-settable on `/profiles`
    (migration `0011`). (b) The `test_prep` goal (ADR-005) names a mode but not *which* hand-authored
    test (SAT vs ACT) — closed by storing `assessments.test_slug`, chosen by the buyer at the start
    of the First Session flow (migration `0013`). Both are additive, non-breaking; worth a
    `03_REQUIREMENTS.md` pass to fold in formally.
12. **M6 (ADMIN-001/002, FIRST-001..004) is code-complete but not live-verified.** Same limitation as
    M3–M5. The probe-and-descend engine's traversal logic (`src/lib/assessment/probe.ts`) and the
    written-plan renderer (`src/lib/assessment/plan.ts`) are pure functions with full fixture-graph
    test coverage and are trustworthy; what's unverified is everything touching Postgres/Stripe/
    Google/Resend — admin RLS cross-account reads, the First Session booking RPC, and the assessment
    flow's real question content (most roadmap nodes are unauthored, so most probes will hit the
    "no content" skip path — see `session.ts`'s comment on that). Checklist added to `VERIFY.md` §4.
13. **M7 (TASK-OPS-001) is not code** — it's the launch checklist itself (live Stripe products,
    Resend DNS, apex cutover, backups, real-card money-path test) plus `TASK-WORKSHEET-001`
    (printable worksheets — **built**, at `/courses/<slug>/worksheet`) and `TASK-CONTENT-002`
    (continuous content authoring, out of code scope by design, ADR-004). Full checklist in
    `VERIFY.md` §5, including the ToS/Privacy/Refund pages this session wrote with correct
    behavioral content but placeholder legal-entity fields (name/address/jurisdiction/contact) —
    those are business facts with no source of truth in this codebase and were not invented.

**As of 2026-08-14, every implementation-plan task through M7 that has a code deliverable is
code-complete** (`spec/12_IMPLEMENTATION_PLAN.md`). What remains is exactly two things: the
live-verification pass this environment cannot run (`VERIFY.md`, all five sections — Supabase/
Stripe/Google/Resend all need real accounts/Docker), and the genuinely non-code launch steps in
`VERIFY.md` §5.

## Doc tree

**TASK-SPEC-004 done (2026-08-14).** `docs/` now holds the layered L0–L4 tree (`docs/README.md` is
the index), built from spec/14 + this matrix: business (`00`), context/actors/journeys (`01`),
invariants + traps (`02`), one file per flow (`journeys/`), one file per built module
(`components/`). It's a navigation/narrative layer over `/spec`, not a duplicate — `/spec` stays the
single source of truth. The v1 archive remains at `docs/archive/v1-sat/`.
