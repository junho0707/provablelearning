# F13 — Operator: refunds

**Actor:** Admin-Tutor · **Status:** 🟡 code-complete, not live-verified (`TASK-ADMIN-*`)

## Trigger

A refund is owed (e.g. a customer dispute, an operator error).

## Steps

1. No self-serve path exists for buyers.
2. Operator issues the refund in the **Stripe dashboard** directly.
3. Operator applies the matching **admin ledger adjustment** in-app (`credit_ledger`, `reason =
   'admin_adjust'`) so the wallet balance and Stripe cannot drift apart.
4. Audited in `audit_log` (`REQ-BILLING-003`).

## Why it matters structurally

This is a manual, two-system process by design — see `02-invariants.md` "No self-serve refunds."
Automating the Stripe side without also guaranteeing the ledger adjustment happens in the same
operation would reintroduce the drift this process exists to prevent.

## Requirements / tests

`REQ-BILLING-003`.

## Components

Not yet built.
