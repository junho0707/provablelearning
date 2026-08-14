# stripe-create-checkout — Stripe Checkout Session builder

## Purpose

Creates the Stripe Checkout Session that drives the pay-now path. Returns a `session.url` for the action to redirect to, and a `session.id` to store on the enrollment so the webhook can match the row.

## Behavior

- `mode: 'payment'`; `payment_method_types: ['card', 'us_bank_account']` (so ACH is supported, including the `async_payment_*` flow).
- One line item built from `getPriceForGroupSize(groupSizeType)` × 1.
- `metadata.enrollment_id` / `student_id` / `class_id` — keyed back into the webhook handler.
- `success_url` includes `{CHECKOUT_SESSION_ID}` and an `&from=pay_later` flag for pay-later checkouts.
- `cancel_url` carries `enrollment_id` so the cancel page knows what to roll back.
- `expires_at = now + PENDING_ENROLLMENT_TTL_MINUTES (= 30 min)` — Stripe will fire `checkout.session.expired` after that.

## Inputs / outputs / side effects

- **Input:** `{ enrollmentId, studentId, classId, groupSizeType, className, amountInCents, customerEmail?, isPayLater? }`.
- **Output:** Stripe `Checkout.Session`.
- **External call:** `stripe.checkout.sessions.create`.

## File paths

- `src/lib/stripe/create-checkout.ts`
- `src/lib/stripe/client.ts` — singleton Stripe client
- `src/lib/stripe/prices.ts` — price helpers

## Journeys that use it

- [enroll](../journeys/enroll.md) — pay-now and waitlist-offer-pay-now
- (also called from `payNowAction` for deferred-pay completion — see end-enrollment / view-my-data journeys when written)
