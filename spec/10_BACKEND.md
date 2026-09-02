# 10 — Backend Design

Status: **LIGHT (intentional), refreshed 2026-08-14** against ADR-003/004/005 · Detailed
service/handler design lives in each `TASK-*`'s implementation notes. This file records the
module→responsibility map, the correctness-critical patterns, and integration behavior. Modules:
`06_ARCHITECTURE.md`; entities/RPCs: `07_DATA_MODEL.md`; contracts: `08_API_CONTRACTS.md`.

## Modules → use cases

| Module | Use cases | Backed by |
|---|---|---|
| `content` | build Learning Path, render lesson | in-repo MDX (ADR-001) |
| `practice` | check answer (server), reveal free-response | `questions` |
| `progress` | record attempt, mark/read progress | `question_attempts`, `lesson_progress` |
| `accounts` | Google OAuth + magic link, profile CRUD, active-profile switching | `accounts` (auto-provisioned trigger), `learner_profiles` — no consent flow (INV-ACTOR-1) |
| `credits` | balance, spend | `credit_ledger`, `book_session` RPC |
| `billing` | checkout, process purchase | Stripe, `process_purchase` RPC, `stripe_events` |
| `booking` | availability, book, cancel, calendar | `book_session`/`cancel_booking` RPCs, Google |
| `notifications` | confirmation, reminders, receipt | email provider (Resend) |
| `admin` | authoring, availability, refunds, users | `refund_credit` RPC, `audit_log` |

## Correctness-critical patterns (non-negotiable — NFR-SEC-002)

- **Atomicity via RPC.** Credit spend and slot reservation happen only inside `SECURITY DEFINER`
  Postgres functions with `SELECT … FOR UPDATE`. The app never spends/reserves with separate
  client writes. Ported discipline from v1 `apply_credits` / `reserve_seat`.
- **Idempotency.** The Stripe webhook keys on `stripe_events.id`; reminders key on
  `reminded_24h/1h`; cancellation is idempotent. Retries are safe (NFR-REL-001).
- **Authorization defense-in-depth.** RLS is the primary boundary (NFR-SEC-001); server actions
  additionally check role/ownership before calling RPCs; admin role is seed-only.
- **Validation.** Zod at every server boundary; numeric answer checking normalizes + applies the
  question's `tolerance`.

## Integration behavior

- **Stripe.** Verify signature before acting; the webhook (not the browser redirect) is the
  source of truth for crediting. Reconcile ledger against the Stripe dashboard.
- **Google Calendar/Meet.** Called *after* the booking transaction commits; failures are logged
  and retried and never roll back a booking (AT-BOOK-006).
- **Email.** Best-effort transactional; reminder cron retries unsent; never blocks a booking.

## Observability & ops

Money/booking/admin actions → `audit_log` (NFR-OPS-002). Cron endpoints are secret-guarded.
Scheduled backups (NFR-OPS-003). Everything operable by one person (NFR-OPS-001).
