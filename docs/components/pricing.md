# Pricing config

**Code:** `src/lib/pricing.ts` · **Serves:** F5, F7 · **Status:** ✅ built

## What it does

Single source of truth for every SKU's price, name, and Stripe price-id lookup — `spec/14`'s
pricing table, as code, checked by a test that fails CI on drift.

## Contents

- `PRICING: Record<SkuId, PricingSku>` — one entry per SKU (`first_session`, `credits_1/2/4/8`)
  with `name`, `priceCents`, `credits` granted, and the env var holding its live/test Stripe price
  id. First Session grants 0 spendable `credits` (deliberate: it books directly, it isn't a credit
  to spend later).
- `formatPrice(cents)` — `$49`, not `$49.00`; strips a trailing `.00`.
- `stripePriceId(sku)` — reads the SKU's Stripe price id from `process.env`, **throws if unset**.
  Checkout must fail loudly rather than silently misprice a purchase.

## The drift guard

A test (`src/lib/pricing.test.ts`) asserts these values match `spec/14_GROUND_TRUTH_INTERVIEW.md`
§11 exactly. **If you change a price, change the spec in the same change** — the test exists
specifically to make a silent drift between code and spec fail CI (`HANDOFF.md`).

## What depends on it

`src/app/page.tsx` (landing page prices, F5's entry point) pulls numbers from here rather than
retyping them. F5/F7's checkout flow (not yet built) will call `stripePriceId` to build the Stripe
Checkout session.
