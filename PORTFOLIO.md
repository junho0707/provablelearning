# PORTFOLIO — what was built, technically

Written 2026-09-10. **Purpose:** a factual record of what exists in this repo, written so that a
resume bullet, a website project entry, or an interview answer can be drawn from it without
re-reading the codebase — and without overclaiming.

This is not product truth. `system/` is (see `CLAUDE.md`). This file describes the *implementation*.

---

## 1. One-line description

A production-grade Next.js + Postgres booking and payments platform for a 1:1 math tutoring
business, where the central engineering constraint is a COPPA-driven permission boundary between
the paying parent and the under-13 student, enforced in the database rather than in the UI.

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, Server Components + Server Actions) |
| Language | TypeScript (strict), Zod for input validation |
| Database | Supabase Postgres — RLS, SQL functions, views, triggers |
| Auth | Supabase Auth — Google OAuth, magic link, email+password, plus a second synthetic identity class for students |
| Payments | Stripe Checkout + webhooks (test mode wired; live mode not cut over) |
| Email | Resend (transactional) |
| Calendar | Google Calendar API — event creation with auto-provisioned Google Meet links |
| Storage | Supabase Storage (session uploads), access-scoped by RLS |
| Scheduling | Vercel Cron (hourly session-reminder job) |
| Tests | Vitest |
| Hosting | Vercel |

## 3. Scale of the thing

Measured 2026-09-10 on branch `design/poster-panels`:

- **~15,600 lines** of TypeScript/TSX across 203 files
- **~2,400 lines** of SQL across **26 migrations**
- **26 tables**, **25 SQL functions/RPCs**, **61 RLS policies**, plus a scoped view (`student_sessions`)
- **36 routes** (buyer app, student app, admin/tutor console, legal, webhook, cron)
- **336 tests in 47 files**, all passing; `tsc --noEmit` and `next build` clean
- 8 ADRs, ~9 system-design documents, built solo Feb 2026 – Sep 2026

## 4. The parts that were actually hard

These are the items worth talking about. Everything else is CRUD.

### 4.1 A permission boundary enforced by schema shape, not by checks

Two human actors share one app: the **buyer** (a parent, who pays and books) and the **student**
(often under 13, who prepares for and reviews sessions). A student must never reach money, booking,
or messaging data.

The implementation does this *structurally*: **a student has no `accounts` row at all.** Every
money/booking/messaging policy is already written as `account_id = auth.uid()`, so a student is
denied by all of them without a single student-specific check existing anywhere. Where a student
legitimately needs to see their own session and Meet link, they read a **scoped view**
(`student_sessions`), never the `bookings` table.

Why it matters: the invariant ("no student can read the money tables") is true because of the shape
of the schema, so it cannot be broken by forgetting a check in a new feature. Adding a
student-facing policy to a protected table is the one way to collapse it, and that is documented as
the top trap in `HANDOFF.md`.

### 4.2 Consent-gated login activation (COPPA)

Student auth users are **created banned**. They are unbanned only when a payment records parental
consent in the same database transaction as the purchase (`process_purchase` → `record_consent`),
after which the Stripe webhook lifts the auth-layer ban.

This is deliberately a **two-flag** design: `login_active` is a database column read by RLS (the
boundary), and Supabase's `ban_duration` is an auth-layer block (the door). Setting only one
produces either a student who can authenticate but read nothing, or one who can read but not sign
in.

Supporting detail: student identities are minted on the reserved `.invalid` TLD (RFC 2606), which is
guaranteed never to resolve — so "no email can ever reach a student" is a property of the address
rather than a rule someone has to remember. Parent-facing consent review / revoke / delete is
implemented, with uploads keyed by profile so deletion is exhaustive.

### 4.3 Money correctness in the database

- Webhook redelivery is idempotent via a `stripe_events` primary-key guard — replaying a Stripe
  event grants nothing twice.
- "One discounted First Session **per student**" is enforced by a database constraint, not by
  hiding a button, so a crafted request is refused at the same place a legitimate one is.
- Credit grants, spends, and returns are a ledger; balance is a function over it.
- The webhook is written never to throw — a failed post-payment side effect is made recoverable
  rather than causing Stripe to retry a payment that already succeeded.

### 4.4 Credit-return cap enforced at request *and* approval

Refund-in-credit for late cancellations and no-shows is capped at 2 per calendar month, per student,
combined across both causes — enforced in Postgres at both the request and the approval path, and
counted by **the session's month, not the approval's**, so a slow human review cannot silently eat
the customer's next month.

### 4.5 Availability, DST, and freed slots

No slot rows are stored. A "slot" is an instant regenerated from a recurring weekly template plus
one-off exceptions, iterated **day by day in the operator's own timezone** so a rule means the same
wall-clock hour on both sides of a DST transition, while what is persisted is an absolute instant.
A 2-hour booking-notice window, a Monday-stepped booking horizon, and a separate `released_slots`
table (a freed slot is bookable down to a 1-hour floor) sit on top. The DST/horizon math is pure and
unit-tested.

### 4.6 Documentation that fails CI when it drifts

Every policy number (session length, notice window, cancellation window, return cap, retention) and
every price lives in one constants module, and a test **reads the markdown spec at runtime** and
fails the build if the document and the code disagree. Similarly, each migration has a companion
test asserting the migration's SQL text says what a live database would enforce.

This is the thing that most surprises people: the spec is executable, so a policy change made in
only one of the two places cannot merge.

### 4.7 The rest, briefly

Pre-session diagnostics authored as data and served by test slug or class level (published-gated by
RLS, so drafts are invisible and withdrawal is non-destructive); post-session materials with the
same draft/publish RLS treatment; a buyer↔tutor messaging thread with no student entry point; an
admin/tutor console for availability, bookings, diagnostics, materials, credit returns, and users;
an hourly cron for session reminders.

## 5. Honest status — read before writing any claim

**The code is complete and tested; the business has not launched and no flow has been walked against
the live stack.** Specifically:

- All build stages with a code deliverable are done; 336 tests pass.
- Migrations are applied to the hosted Supabase project and every credential passes a preflight
  check (Supabase, Stripe test mode, Google, Resend, cron).
- **But:** there is no Docker in the dev environment, so the test suite exercises **no Postgres**.
  Database-level tests assert SQL *text*, not Postgres *behavior*. External-service tests are
  mocked, so they prove this codebase's error handling, not the integration.
- Stripe is **test mode only**. No real payment has been taken.
- No paying customer, no live student, no revenue.
- The COPPA design has **not** been reviewed by a lawyer yet.

**Therefore:** claims about *building, designing, and testing* the system are fully supported.
Claims about users, revenue, uptime, scale, or "launched / in production" are **not** — do not write
them. Twilio is in `package.json` but unused in `src/` (SMS is a manual admin worklist), so do not
claim an SMS integration.

## 6. Candidate resume phrasings

Short form, all defensible against §5. Pick one; don't stack them.

**Three-line entry**

> **Provable Learning** — Solo founder / engineer · Feb 2026 – Sep 2026
> - Built a 1:1 tutoring booking and payments platform end to end (Next.js 16, TypeScript, Supabase
>   Postgres, Stripe, Google Calendar): 26 migrations, 26 tables, 61 RLS policies, 336 passing tests.
> - Designed a COPPA-driven parent/child permission boundary enforced by schema shape — students hold
>   no account row, so every money and booking policy denies them by construction — with
>   consent-gated login activation recorded in the same transaction as payment.
> - Made money paths correct in the database rather than the UI: idempotent Stripe webhooks, a credit
>   ledger, per-student purchase limits, and a monthly refund cap enforced at both request and approval.

**Two-line entry**

> **Provable Learning** — Solo founder / engineer · Feb 2026 – Sep 2026
> - Built a tutoring booking and payments platform end to end (Next.js 16, TypeScript, Supabase
>   Postgres, Stripe, Google Calendar) — 26 migrations, 61 RLS policies, 336 passing tests.
> - Enforced a COPPA parent/child data boundary and all money invariants (idempotent webhooks, credit
>   ledger, capped refunds) in Postgres rather than in application code.

**One-line entry**

> **Provable Learning** (solo, 2026) — Next.js 16 / Supabase Postgres / Stripe tutoring platform;
> COPPA parent-child data boundary and all payment invariants enforced in the database (26
> migrations, 61 RLS policies, 336 tests).

## 7. Candidate website copy

**Short blurb (card)**

> A 1:1 math tutoring platform built solo — booking, payments, and a parent/child account model
> designed for under-13 students. The interesting constraint: a child must never be able to reach
> the money. I solved it in the schema instead of the UI, so the guarantee holds even for features
> that don't exist yet.

**Longer paragraph (project page)**

> Provable Learning is a tutoring business and the software that runs it: availability and booking
> with DST-correct slot generation, Stripe checkout and a credit ledger, Google Meet provisioning,
> pre-session diagnostics, post-session materials, and a parent↔tutor message thread. Two people
> share the app — the parent who pays and the child who learns — and COPPA means the second must
> never reach the first's data. Rather than guard every query, I gave students no account row at
> all, so the existing `account_id = auth.uid()` policies deny them by construction, and let them
> read their own sessions through a scoped view. Their logins are created banned and activated only
> when a payment records parental consent in the same transaction. Money rules live in Postgres too:
> webhook replays are idempotent, the one-per-student intro offer is a constraint, and the monthly
> refund cap is enforced at both request and approval. The specs are executable — a test reads the
> policy document at runtime and fails CI if the prose and the constants disagree.

## 8. Interview talking points

1. "Why does a student have no account row?" — invariants you get from schema shape survive future
   features; invariants you get from checks don't.
2. "Why two flags for one login?" — RLS and session minting are different layers; the failure modes
   of setting only one are asymmetric and both bad.
3. "Why does a test read a markdown file?" — the drift between documentation and behavior is the
   real defect; making it a build failure is cheaper than review discipline.
4. "What don't you know?" — the whole live-verification story in §5. The willingness to say this is
   itself worth saying.
