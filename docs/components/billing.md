# Billing — Stripe checkout & webhook

**Code:** `src/lib/billing/{checkout,stripe}.ts` · `src/app/api/webhooks/stripe/route.ts` ·
**Serves:** F5 (buy the First Session), F7 (buy credit packs) · **Status:** 🟡 code-complete, not
live-verified

## What it does

Starts a Stripe Checkout session for either SKU family and, on the webhook side, turns a completed
checkout into a credited/purchased account via `credits.md`'s `process_purchase` RPC.

## How it fits together

```
createCreditsCheckout(sku)        ──┐
createFirstSessionCheckout(goal)  ──┼──► startCheckout() ──► Stripe Checkout Session ──► checkoutUrl
                                     │        (stripeClient(), lazy — no key needed at build time)
                                     │
Stripe redirects buyer to success/cancel_url; separately, Stripe calls the webhook:

POST /api/webhooks/stripe ──► verify signature ──► process_purchase RPC ──► sendReceipt (if newly processed)
```

- **`checkout.ts`**
  - `createCreditsCheckout({ sku })` — validates `sku` is one of `credits_1/2/4/8`, requires a
    signed-in caller, delegates to `startCheckout`.
  - `createFirstSessionCheckout({ profileId, goal })` — validates `goal` is
    `strengths | test_prep | class_help`, requires sign-in. **First line of defense for
    `INV-MONEY-2`**: checks for an existing `first_session` purchase and refuses
    (`already_purchased`) before ever hitting Stripe — the partial unique index in `0004_credits.sql`
    is the backstop that makes it true under concurrency, not the sole enforcement. `profileId` is
    accepted but not validated here — First Session purchase precedes the assessment flow that
    consumes it (`assessment.md`).
  - `startCheckout` — builds the Stripe session with `metadata: { account_id, sku, goal? }` (the
    webhook trusts nothing else), `success_url`/`cancel_url` pointed at `/first-session` (First
    Session) or `/wallet` (credits).
  - Returns a discriminated `CheckoutResult` (`ok: true` + URL, or `ok: false` + a
    `denied | already_purchased | malformed` code) rather than throwing.
- **`stripe.ts`** — `stripeClient()`, a lazily-constructed singleton so importing the module doesn't
  require `STRIPE_SECRET_KEY` at build time (only when a checkout/webhook actually runs).

## The webhook (`/api/webhooks/stripe`)

`NFR-SEC-004`: verifies the Stripe signature (`stripe-signature` header + `STRIPE_WEBHOOK_SECRET`)
before trusting anything in the payload — bad/missing signature is `400`, not a silent skip. Ignores
every event type except `checkout.session.completed`. Reads `account_id`/`sku`/`goal` from
**metadata it set itself** at checkout time; a webhook is an untrusted trigger surface, so malformed
metadata fails closed (`400`) rather than crediting a guess. Calls `process_purchase` via the
**admin client** (service role — this RPC is `service_role`-only). Sends a receipt email
(`notify.md`'s `sendReceipt`) **only when `process_purchase` returns `true`** — `false` means this
was a Stripe redelivery no-op (`INV-MONEY-3`), and re-sending a receipt for that would be a genuine
duplicate, not a harmless retry.

## What depends on it

Landing page CTA and `/wallet`/`/first-session` purchase buttons call the checkout actions. Stripe
itself calls the webhook route directly (not reachable from app code).
