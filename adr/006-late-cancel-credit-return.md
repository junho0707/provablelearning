# ADR-006 — A late cancellation may be appealed, like a no-show

- **Status:** Accepted (2026-08-18)
- **Deciders:** Owner (Admin-Tutor), agent
- **Related:** `spec/14_GROUND_TRUTH_INTERVIEW.md` §5, §15 (amended by this ADR)
- **Amends:** the cancellation rule only. The 24-hour threshold, the booking horizon, rescheduling,
  and pricing are all unchanged.

## Context

Two adjacent rules were decided asymmetrically.

A **no-show** burns the credit, but the buyer can submit a request to have it returned, which lands
in the admin queue for approval (§15). A **cancellation inside 24 hours** also burns the credit —
with no appeal at all. The credit is simply gone.

Nothing justifies the asymmetry. Both cases are "the session didn't happen and the tutor's hour was
held," and the reason a buyer misses a session late is usually the same reason they cancel late: a
genuine emergency. Offering recourse in one case and not the other reads as arbitrary to the person
it happens to, and it is the harsher rule that applies to the buyer who *did* the considerate thing
by telling the tutor in advance.

The machinery to fix this already exists end to end: `credit_return_requests`, the
`request_credit_return` RPC, the admin queue, and `resolve_credit_return_request`. Only the
eligibility test was no-show-only.

## Decision

**1. A cancellation inside 24 hours still burns the credit.** Unchanged, and deliberately so — the
default has to stay costly or the 24-hour rule stops protecting the tutor's held hour.

**2. The buyer may request that burned credit back**, through the same request → admin review →
approve/deny path that no-shows already use. It is a request, not an entitlement.

**3. Approval is discretionary and reviewed case by case.** Deliberately *not* specified as
"emergencies only": a written rule invites arguments about what qualifies, and the operator is a
single person who can simply read the reason and decide. Public copy says "reviewed case by case."

**4. Eligibility is defined as "the credit was burned," not as a status.** `cancel_booking` writes no
"late" flag — a free cancel and a late cancel both land on `status = 'cancelled'`. The distinguishing
trace is the `cancel_refund` ledger row, written only when the cancel was ≥24h out. So a booking is
appealable when it is a `no_show`, or `cancelled` with no `cancel_refund` row. This keys the rule to
the fact that matters and needs no schema change.

**5. One live appeal per booking.** A `pending` or `approved` request blocks another; a `denied` one
may be resubmitted. Without this an approval could be claimed twice.

## Consequences

- Migration `0015_late_cancel_credit_return.sql` replaces `request_credit_return`. No schema change,
  no data migration — approvals write `noshow_return`, never `cancel_refund`, so the eligibility test
  stays correct after an approval.
- `/book` offers "Request credit back" on late-cancelled bookings and collects a written reason.
  Previously the reason was hardcoded to `"I was there on time."`, which carries no information for
  a case-by-case review; it is now entered by the buyer.
- The admin queue takes late-cancel appeals with no change — it was never no-show-specific.
- Expect more requests to review. This is the intended cost; the alternative was silently keeping
  money from people with a good reason.
- **Not done:** no notification is sent when a request is approved or denied. The buyer sees the
  outcome only on `/book`. Worth revisiting if volume makes that insufficient.
