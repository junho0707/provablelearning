# stripe-webhook-handlers — `/api/webhooks/stripe` dispatcher

## Purpose

Activates enrollments after Stripe Checkout completes, frees seats when Checkout expires, and provides an asynchronous transition trigger for [02-invariants — Enrollment](../02-invariants.md#enrollment).

## Events handled

- `checkout.session.completed` → `handleCheckoutCompleted`
- `checkout.session.expired` → `handleCheckoutExpired`
- `checkout.session.async_payment_succeeded` → delegates to `handleCheckoutCompleted` with `payment_status='paid'`
- `checkout.session.async_payment_failed` → delegates to `handleCheckoutExpired`, plus an `admin_logs` entry

## Behavior

### `handleCheckoutCompleted`
- If `session.payment_status === 'unpaid'` (ACH pending): no-op; waits for `async_payment_succeeded`.
- Updates the enrollment row matched on `(id = enrollment_id, stripe_session_id = session.id)` with `status='active'`, `payment_status='paid'`, `payment_deadline=NULL`. The match is restricted to `status IN ('pending','active')` so reruns are idempotent.
- Best-effort: invites the student to the slot-1 Google Classroom (and slot 2 for dual-slot SG); sets `classroom_joined=true` on success.

### `handleCheckoutExpired`
- If the enrollment is `active+unpaid` (deferred-pay attempt): clears `stripe_session_id` only; the seat persists.
- If the enrollment is `pending`: reverses any `credits_applied` via `reverse_credits` RPC, deletes the row, and dispatches waitlist auto-enroll for both slot class IDs via `dispatchWaitlistAutoEnroll`.

### `reconcileStripePayments` (called by the `reconcile` cron, exported here)
- Compares each `active` enrollment's Stripe session against DB; logs mismatches to `admin_logs`.
- For `pending` rows older than 30 min: if Stripe says `expired`, runs the same expired-flow; if Stripe says `paid`, activates the row (catches missed webhooks).
- Logs orphaned `pending` rows (no `stripe_session_id`).

## Inputs / outputs / side effects

- **Input:** Stripe-signed POST body. Signature verified with `process.env.STRIPE_WEBHOOK_SECRET`.
- **Reads:** `enrollments`, `classes`, `students`, Supabase Auth.
- **Writes:** `enrollments`, `admin_logs`. Calls `reverse_credits` RPC, `dispatchWaitlistAutoEnroll`, `inviteStudentToClassroom`.

## File paths

- `src/app/api/webhooks/stripe/route.ts` — entry point, verifies signature, switches on event type
- `src/lib/stripe/webhook-handlers.ts` — all four handlers + `reconcileStripePayments`

## Journeys that use it

- [enroll](../journeys/enroll.md) — async transition for pay-now
- (Reconciliation also referenced by [cron-reconcile](cron-reconcile.md))
