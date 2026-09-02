# Booking — slots, book, manage, calendar

**Code:** `src/lib/booking/{slots,timezone,availability,book,manage,calendar,history}.ts` ·
`supabase/migrations/0006_availability.sql`, `0007_bookings.sql`, `0008_booking_lifecycle.sql` ·
`/book` page · **Serves:** F8 (book a session), F9 (cancel/reschedule), F10 (no-show + credit
return) · **Status:** 🟡 code-complete, not live-verified

## What it does

Derives which slots are open (DST-correct, 24h notice / 4-week horizon), books one atomically
against a credit, and handles cancel/reschedule/no-show/credit-return — with Google Calendar/Meet
as a best-effort side effect that can never block or undo a booking.

## How it fits together

```
availability_rules + availability_exceptions ──► generateSlots() [slots.ts, pure]
                                                        │
                                          getOpenAvailability() [availability.ts]
                                          (filters: isBookable, not already taken)
                                                        │
                                                        ▼
                                    bookSession(profileId, startsAt) [book.ts]
                                                        │
                                          book_session RPC [0007_bookings.sql]
                                     (advisory lock on slot instant + spend_credit + insert)
                                                        │
                                          ── after commit, best-effort, never undoes the booking ──
                                          attachCalendarEvent()        sendBookingConfirmationEmail()
                                          [calendar.ts]                [notify.md]
```

- **`slots.ts`** — pure. `generateSlots(rules, exceptions, {from, to, timeZone})` expands recurring
  weekly `availability_rules` into concrete UTC instants over a window, applying
  `availability_exceptions` (`blackout` removes, `extra` adds). `isBookable(slot, now)` enforces the
  24h-notice / 4-week-horizon window. DST-boundary-correct because it works in the tutor's IANA time
  zone (`TUTOR_TIMEZONE`, `timezone.ts`) and converts to UTC per-instant rather than doing fixed-offset
  arithmetic. This is the most trustworthy code in the module — pure, no I/O, directly unit-tested
  (`slots.test.ts`, `timezone.test.ts`).
- **`availability.ts`** (`getOpenAvailability`) — reads rules/exceptions via the buyer's RLS-scoped
  client, but reads *which instants are taken* via the **admin client**, selecting only `starts_at`
  (no account-identifying columns) — `bookings` RLS scopes select to the owning account
  (`AT-SEC-001`), so a buyer must see a slot is gone without seeing whose it is. This filtering is a
  **display convenience only**; the real double-book guard is the RPC below.
- **`book.ts`** (`bookSession`) — thin validated wrapper around the `book_session` RPC. Every real
  invariant (ownership, `INV-BOOK-1`, `INV-MONEY-1`) is enforced in Postgres, not here (`CON2`).
  After the RPC commits, calls `attachCalendarEvent` and `sendBookingConfirmationEmail` — both
  best-effort; neither failure can undo or fail the already-committed booking (`INV-BOOK-2`).
- **`manage.ts`** — `cancelBooking`, `rescheduleBooking`, `requestCreditReturn`. Each is a thin
  wrapper: the refund/burn decision (cancel), the 24h-notice re-check (reschedule), and eligibility
  (`no_show` status only, for credit return) all live in their respective RPC, not here.
- **`calendar.ts`** — see "Calendar/Meet never blocks a booking" below.
- **`history.ts`** — buyer's upcoming/past bookings for the `/book` page list.

## Migration `0007_bookings.sql` — `book_session`

`bookings.status` is `booked | cancelled | completed | no_show`. A **partial unique index**
`bookings_one_live_per_slot on bookings (starts_at) where status <> 'cancelled'` is the DB-level
backstop for `INV-BOOK-1` (≤1 live booking per slot). `book_session` also takes
`pg_advisory_xact_lock(hashtext(starts_at::text))` before checking/inserting — the lock closes the
race window between "slot looks open" and "insert," the unique index catches anything that slips
through. Internally calls `spend_credit` (`credits.md`) in the same transaction, so a credit is
never spent without a booking existing, or vice versa.

## Migration `0008_booking_lifecycle.sql`

- **`cancel_booking`** — refund-or-not decided in SQL (24h+ notice → credit refunded via
  `credit_ledger`; inside 24h → credit burned), never in application code.
- **`reschedule_booking`** — only permitted ≥24h before the **current** start; takes the same
  advisory-lock pattern on the new slot instant. **Leaves the ledger untouched** — this is
  deliberate, not an oversight: implementing reschedule as cancel+rebook would touch the ledger and
  could be used to dodge the 24h rule (`HANDOFF.md` traps).
- **`mark_no_show`** (admin-only) — flips `booked → no_show`, writes `audit_log`.
- **`request_credit_return`** — buyer-callable, only valid when the booking's status is already
  `no_show`. Inserts a `pending` row in `credit_return_requests`.
- **`resolve_credit_return_request`** (admin-only) — approve/deny, `for update` row lock on the
  request, writes `audit_log`. Approval is the only path that credits `noshow_return` back to the
  ledger — no self-serve refunds anywhere in this system.

## Calendar/Meet never blocks a booking (`calendar.ts`, `INV-BOOK-2`)

`createCalendarEvent` wraps the entire Google Calendar API call in try/catch and returns `null` on
**any** failure — auth error, API outage, malformed response — instead of throwing. `meet_url` is
nullable on the `bookings` table *by design*: the Calendar call happens **after** the booking
transaction commits, so a Google outage must leave a valid booking with a missing Meet link
(surfaced on the admin "missing-Meet-link queue," `admin.md`), never a rolled-back booking
(`AT-BOOK-006`, tested with the Google SDK mocked in `calendar.test.ts`). `cancelCalendarEvent` and
`updateCalendarEventTime` are the same pattern — best-effort, swallow failures, since the booking's
own state has already changed either way by the time these run.

## What depends on it

`/book` page (slot picker in the buyer's browser time zone, upcoming/past list, cancel + no-show
credit-return UI), `assessment.md`'s `book_first_session` (a sibling RPC that reuses the same
advisory-lock-on-slot pattern but never spends a credit), `admin.md`'s bookings calendar and
missing-Meet-link queue.
