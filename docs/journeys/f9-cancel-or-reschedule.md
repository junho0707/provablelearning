# F9 — Cancel or reschedule

**Actor:** Buyer · **Status:** 🟡 code-complete, not live-verified (part of `TASK-BOOK-*`)

## Trigger

Has an upcoming booking and wants to change it.

## Steps

| Action | ≥24h ahead | <24h ahead |
|---|---|---|
| **Cancel** | slot reopens, **credit returned** | slot reopens, **credit burns** |
| **Reschedule** | moves to another open slot, **ledger untouched** | not offered — cancel instead |

## Why it matters structurally

**Reschedule is not cancel-and-rebook.** See `02-invariants.md` — implementing it as a
refund/respend pair would create a ledger entry that could be used to dodge the 24h rule (cancel
late, "rebook" immediately as a reschedule to avoid burning the credit). The <24h reschedule case
is refused entirely rather than routed through cancel, for the same reason.

## Guards / invariants

- Cancellation is idempotent — at most one `refund` ledger row per booking.
- The slot always reopens on cancel, regardless of the 24h boundary; only the credit outcome
  differs.

## Failure paths

- Double-cancel attempt (e.g. two tabs) → second attempt is a no-op, not a second refund.

## Requirements / tests

`REQ-BOOK-003, 004`.

## Components

Not yet built. Extends the `booking` module F8 introduces.
