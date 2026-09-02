# F7 — Buy credit packs

**Actor:** Buyer · **Status:** 🟡 code-complete, not live-verified (`TASK-CREDIT-001`, `TASK-BILLING-001..002`) — this is
where essentially all revenue lives (`00-business.md`).

## Trigger

From the wallet UI or the post-session prompt, picks a pack: 1/$75 · 2/$120 · 4/$200 · 8/$350.

## Steps

1. Picks a pack size.
2. Stripe Checkout → **idempotent** webhook → ledger credited **exactly once**
   (`INV-MONEY-3`).
3. Balance = Σ deltas over `credit_ledger` — never a stored counter (`INV-MONEY-1`). **Credits
   never expire** — no expiry column exists, deliberately.

## Guards / invariants

- `INV-MONEY-3` — the webhook, not the browser redirect, is the only trusted trigger for a ledger
  credit.
- No cached balance column (`02-invariants.md`) — reads always sum the ledger.

## Failure paths

- Checkout abandoned → no purchase, no ledger row.
- Webhook redelivered → `stripe_events` insert-first makes it a no-op, not a double credit.

## Requirements / tests

`REQ-CREDIT-001..004`, `REQ-BILLING-001..002` · `AT-BILLING-001/002`, `AT-CREDIT-*`.

## Components

Not yet built. Will need a `billing` module (shared with F5's Stripe checkout) and a `credits`
module (the ledger + spend RPC that F8 also depends on).
