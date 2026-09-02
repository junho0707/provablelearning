# Credits & wallet

**Code:** `src/lib/credits/{balance,history,types}.ts` · `supabase/migrations/0004_credits.sql` ·
`/wallet` page · **Serves:** F7 (buy credit packs) · **Status:** 🟡 code-complete, not
live-verified

## What it does

Reads a buyer's credit balance and purchase/ledger history. All *writes* to credits live in
Postgres RPCs (below), not in this module — reads only.

## How it fits together

- **`balance.ts`** (`getBalance`) — calls the `get_balance()` RPC (`SECURITY INVOKER`, so RLS scopes
  it to the caller automatically). Returns `0` for a signed-out caller or any error, rather than
  throwing — a balance display is a read, not an auth gate.
- **`history.ts`** — `getPurchaseHistory` / `getLedgerHistory`, plain RLS-scoped selects
  (`purchases_select_own` / `credit_ledger_select_own`) against `purchases` and `credit_ledger`.

## Migration `0004_credits.sql`

- **`credit_ledger`** is **append-only** — balance is always `Σ delta`, never a stored counter
  (`INV-MONEY-1`, `02-invariants.md`). `reason` is constrained to
  `purchase | booking_spend | cancel_refund | noshow_return | admin_adjust`.
- **`purchases`** records what was bought, at what price, for which stated `goal` (First Session
  only). A **partial unique index** on `(account_id) where sku = 'first_session'` enforces
  `INV-MONEY-2` (≤1 First Session per account) under concurrency — not just the app-layer check in
  `billing.md`'s `createFirstSessionCheckout`.
- **`stripe_events`** is the webhook-redelivery idempotency guard (`INV-MONEY-3`) — see `billing.md`.
- **`get_balance()`** — `SECURITY INVOKER`, sums the caller's ledger.
- **`spend_credit(account_id, reason, booking_id)`** — `SECURITY DEFINER`, callable only by
  `service_role`. Takes `pg_advisory_xact_lock(hashtext(account_id))` before checking the balance,
  since an append-only ledger has no row to `SELECT ... FOR UPDATE` — the advisory lock is the
  concurrency guard that makes `INV-MONEY-1` (balance never negative) hold under a race. Raises
  `insufficient_credits` if the balance is `< 1`. Called from `book_session` (`booking.md`).
- **`process_purchase(...)`** — `SECURITY DEFINER`, the only writer for a completed Stripe checkout.
  Inserts into `stripe_events` first; a `unique_violation` there means this event was already
  processed, so it returns `false` (redelivery no-op) without touching `purchases`/`credit_ledger`.
  Otherwise inserts the purchase row and, if `p_credits > 0`, credits the ledger. First Session
  purchases grant `0` credits (`pricing.md`) — it books directly, it isn't spent later.

## What depends on it

`/wallet` (balance + history display), `billing.md`'s webhook handler (calls `process_purchase`),
`booking.md`'s `book_session` RPC (calls `spend_credit`).
