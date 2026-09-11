# ADR-009 — The First Session is scheduled before it is paid for

- **Status:** accepted
- **Date:** 2026-09-11
- **Amends:** ADR-007 §4 and `system/03-FLOWS.md` F4, which put payment first and booking second.
  Everything else in ADR-007 stands, including the entitlement itself.

## Context

ADR-007 collapsed the old "First Session flow" into an ordinary booking that happens to be prepaid.
The buyer chose the student and the purpose, paid $25, received an **entitlement**, and then went to
`/book` to pick a time. Booking was deliberately separate because a First Session and a credit
session are the same session, and one booking path is better than two.

Walking the flow for the first time made the cost of that ordering plain. A parent is asked for a
card **before being shown that a time exists which suits them**. Whether Tuesday at 4pm is available
is not a detail to settle after paying — for a working parent it is most of the buying decision. The
buyer is then returned to the page they started on, holding an entitlement with no obvious next
step, having paid for something that has not visibly happened.

The ordering also produced a second, quieter failure: the purchase and the booking were two separate
acts a buyer could half-complete, leaving paid sessions unbooked and unnoticed.

## Decision

**The buyer picks the time before paying, and the payment books it.**

- `/first-session` asks for student, purpose, specifics, and slot, using the same `SlotCalendar`,
  the same 2-hour floor and the same 4-week horizon as F5. There is one calendar, not two.
- The chosen slot rides in the Stripe Checkout session's `metadata`.
- The webhook that records the purchase also books the slot, in the same handler, via a new
  `book_first_session_for_account` (migration 0027) — the `auth.uid()`-reading
  `book_first_session` cannot be called by `service_role`, which has no JWT.
- Stripe returns the buyer to `/dashboard?purchase=success`, which says the payment is processing
  until the booking appears.

## Cost

**The slot is not held during checkout.** Between starting checkout and the webhook landing, someone
else can take it. We accept this rather than build slot reservations with expiry: there is one
tutor, checkout takes under a minute, and the collision requires two buyers on the same slot in the
same minute. When it does happen the buyer keeps a paid, unspent entitlement and books it on `/book`
the ordinary way — the money is never lost, only the convenience.

**Two ways to spend an entitlement now exist** — the webhook's and `/book`'s. That is the price of
making the failure path recoverable, and both go through one function body.

**The purchase page is longer.** It now carries a calendar. That is the point: the length is the
information the buyer needed before reaching for a card.

## Alternatives rejected

- **Hold the slot through checkout** (reservation row + expiry sweep). Correct at scale, and pure
  cost at one tutor — a table, a cron, and an expiry bug waiting to happen, to prevent a collision
  that requires simultaneous buyers.
- **Book on return from Stripe instead of in the webhook.** The redirect beats the webhook, so the
  entitlement does not exist yet; and a buyer who closes the tab would have paid for nothing.
- **Keep pay-first and just redirect to `/book` afterwards.** Fixes the dead end, not the actual
  objection — the card still comes before the calendar.
