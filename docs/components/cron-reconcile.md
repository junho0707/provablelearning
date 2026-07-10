# cron-reconcile — daily Stripe ⇄ DB safety net

## Purpose

A daily safety net for the Stripe webhook: catches missed `checkout.session.completed` and `checkout.session.expired` events, cleans up orphaned `pending` enrollments older than 30 minutes, and logs unexpected mismatches.

## Schedule

`0 6 * * *` (daily 06:00 UTC), defined in `vercel.json`.

## Behavior

Calls `reconcileStripePayments` (exported from [stripe-webhook-handlers](stripe-webhook-handlers.md)):

1. For each `active` enrollment with a non-null `stripe_session_id`: retrieves the Stripe session; logs `reconciliation_mismatch` to `admin_logs` if Stripe disagrees with the DB.
2. For each `pending` enrollment older than 30 minutes with a non-null `stripe_session_id`:
   - If Stripe says `expired`: reverses `credits_applied`, deletes the row, dispatches waitlist auto-enroll for both slots.
   - If Stripe says `paid`: flips the row to `active+paid` and invites to Google Classroom (catches the dropped webhook case).
3. Logs `reconciliation_orphaned_pending` for `pending` rows older than 30 minutes with NULL `stripe_session_id`.

## Inputs / outputs / side effects

- **Input:** Cron trigger; `Authorization: Bearer <CRON_SECRET>` header.
- **Output:** JSON `{ checked, mismatches }`.
- **Side effects:** May delete `pending` enrollments, activate `pending → active`, reverse credits, dispatch waitlist auto-enroll, write `admin_logs`.

## File paths

- `src/app/api/cron/reconcile/route.ts`
- `src/lib/stripe/webhook-handlers.ts` — `reconcileStripePayments`
- `src/lib/auth/verify-cron-secret.ts`

## Journeys that use it

- [enroll](../journeys/enroll.md) — Stripe-expire safety net.
