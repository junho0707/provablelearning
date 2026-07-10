# Provable Learning — SAT Tutoring Platform

> **This is the `v1.0-sat-platform` snapshot.** A production-grade, full-stack SaaS for a
> rolling-enrollment SAT tutoring business — enrollment, scheduling, payments, makeups,
> and Google Workspace integration. Frozen here as a portfolio reference; active
> development continues on `main` toward a v2 math-courses platform.
>
> Browse this version: `git checkout v1-sat` (or the `v1.0-sat-platform` tag).

## What it does

A complete operations platform for a tutoring business with three enrollment tiers and a
rolling, per-student subscription model:

| Tier | Price | Format |
|------|-------|--------|
| **Large Group** | $20/mo | 2×/week fixed schedule, 1.5 hr sessions, recordings |
| **Small Group** | $300/mo | 2 student-picked slots/week, 1–3 students per slot, subject-agnostic |
| **1:1** | $600/mo | 2×/week, dedicated dual-slot scheduling |

Subject (Digital SAT R&W, Math, or both) is chosen per enrollment, not per class — Small
Group and 1:1 classes are subject-agnostic time slots, which lets the same slot serve any
student. Enrollments are rolling: each student carries their own start/end dates rather
than sharing a fixed cohort calendar.

## Feature highlights

- **Rolling per-student enrollment** with dual-/triple-slot scheduling and automatic
  per-session date computation (8 sessions for 2-slot, 12 for 3-slot).
- **Atomic seat reservation** via a Postgres `SECURITY DEFINER` RPC using `FOR UPDATE`
  row locks — both slots reserved together or not at all, no oversell under concurrency.
- **Payments** through Stripe Checkout with a webhook-driven activation state machine, plus
  a "pay later" path (active-but-unpaid with a deadline and an auto-unenroll cron).
- **Credits system** (atomic FIFO deduction RPC) powering makeup bookings.
- **Cancellation & makeups** — cancel a session, auto-find alternate slots, book/cancel
  makeups, with a two-tier waitlist (enrollment + makeup) that auto-enrolls/auto-books FIFO.
- **3-phase drop-class policy** enforced in the database, with refund-consultation routing
  for paid students.
- **Google Workspace integration** — per-student Google Classroom provisioning at
  enrollment, with enrollment-code self-join for external Gmail accounts.
- **Notifications** — transactional email + SMS for bookings, waitlists, and reminders.
- **Role-based dashboards** — Parent, dependent Student, independent Student, and Admin,
  each with tailored capabilities; two-way messaging between families and tutors.
- **Admin suite** — classes, students, performance logs, credits, refunds, makeups, calendar,
  data export, and an audit log.
- **Automated operations** — cron jobs for reconciliation, waitlist notification, credit
  expiry, backups, reports, booking reminders, and auto-unenroll.

## Architecture

- **Framework:** Next.js 16 (App Router, Server Components + Server Actions, `src/` layout)
- **Database & Auth:** Supabase (Postgres, Row-Level Security, PL/pgSQL RPCs), email/password
  + Google OAuth with identity auto-linking
- **Payments:** Stripe (Checkout, subscriptions, webhooks)
- **Integrations:** Google Workspace / Classroom API, email + SMS providers
- **Validation & types:** Zod + strict TypeScript
- **Styling:** Tailwind CSS v4
- **Hosting:** Vercel (functions + cron)

Correctness-critical operations (seat reservation, credit deduction, enrollment inserts)
live in Postgres RPCs behind `SECURITY DEFINER` so invariants hold under concurrency and
cannot be bypassed by the client. RLS restricts every table to the rows a user is allowed
to see (own data, a parent's children, or admin-wide).

## Project layout

```
src/app/(auth)/        login, signup, OAuth callback, onboarding
src/app/(dashboard)/   parent · student · admin · enroll dashboards
src/app/api/           Stripe webhooks + cron endpoints
src/lib/               enrollment · cancellation · credits · scheduling ·
                       stripe · waitlist · notifications · auth · validators
supabase/migrations/   90+ versioned SQL migrations
docs/                  layered architecture docs (business → context → invariants →
                       journeys → components)
```

## Documentation

The `docs/` folder holds a layered design system (L0→L4): business capabilities,
domain context, numbered invariants, per-intent user journeys, and per-module component
docs. Start at [`docs/README.md`](docs/README.md).

---

*Built as a solo full-stack project: data modeling, concurrency-safe backend logic,
payment integration, third-party API orchestration, and role-based product UX.*
