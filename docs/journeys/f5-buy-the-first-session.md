# F5 — Buy the First Session

**Actor:** Buyer · **Status:** 🟡 code-complete, not live-verified (`TASK-FIRST-001..004`) — this is the entry flow, the
critical path for the whole revenue model.

## Trigger

Clicks "Book your first session — $49".

## Steps

1. **States a goal** at purchase time: catching up / not sure where the gaps are (`strengths`) ·
   SAT-ACT prep (`test_prep`) · help with my current class or the year ahead (`class_help`). The
   goal is not cosmetic — it selects the entire next step (see below).
2. Picks or creates the learner profile the session is for.
3. **Guard:** if this account already bought a First Session, the purchase is **refused** and the
   buyer is routed to credit packs instead (`REQ-FIRST-001`, `INV-MONEY-2`).
4. Stripe Checkout → webhook (idempotent, `INV-MONEY-3`) records the purchase row with its `goal`.
5. **Branches on the stated goal:**

   | Goal | Next |
   |---|---|
   | `strengths` | → F6 (assessment), then booking |
   | `test_prep` | → authored practice test for that test, then booking |
   | `class_help` | → **straight to booking, no assessment** — see `02-invariants.md` |

6. Books a slot (F8), attends, and receives a **written plan within 48 hours**.

## Guards / invariants

- `INV-MONEY-2` — enforced by a partial unique index, not just a pre-checkout check (see
  `02-invariants.md` for why the distinction matters).
- The binding copy rule (`00-business.md`): the goal-selection UI must never imply anything is
  wrong — "catching up" not "behind."

## Failure paths

- Checkout abandoned → no purchase row, no side effects; retry is just starting over.
- Webhook redelivered → no-op (`INV-MONEY-3`).

## Requirements / tests

`REQ-FIRST-001..007`, `REQ-BILLING-001..002` · `AT-FIRST-001..006`.

## Components

Not yet built. Will need a `billing` module (Stripe checkout + webhook) and extend
`components/pricing.md` (SKU config already exists).
