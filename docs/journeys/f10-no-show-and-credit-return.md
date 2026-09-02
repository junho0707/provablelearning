# F10 — No-show and credit-return request

**Actor:** Buyer + Admin-Tutor · **Status:** 🟡 code-complete, not live-verified (part of `TASK-BOOK-*`, `TASK-ADMIN-*`)

## Trigger

Student is 15+ minutes late to a session.

## Steps

1. Operator marks the booking `no_show`; the credit **burns** — this is not automatic, the operator
   makes the call.
2. The buyer may submit a **credit-return request** with a reason.
3. It appears in the operator's queue; the operator approves or denies it.
4. **Approve** → writes **exactly one** `credit_ledger` row (`reason = 'noshow_return'`), audited in
   `audit_log`.

## Why it matters structurally

This is deliberately a **request/approve flow, not a silent admin fix** — the operator's judgment
call is the point, and it's recorded (`credit_return_requests.status`, `audit_log`).

## Guards / invariants

- Approving writes exactly one ledger row — a double-approve (e.g. a slow UI double-click) must not
  credit twice.

## Failure paths

- Buyer never requests a return → the burned credit simply stays burned; no automatic reversal.

## Requirements / tests

`REQ-BOOK-005`, `REQ-ADMIN-003`.

## Components

Not yet built. Part of `booking` (no-show marking) and `admin` (the approval queue).
