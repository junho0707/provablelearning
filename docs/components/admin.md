# Admin — operator surfaces

**Code:** `src/lib/admin/{guard,availability,bookings,credit-returns,questions,users,plans,refunds,reminders,time-remaining}.ts` ·
`supabase/migrations/0010_admin.sql`, `0011_sms_worklist.sql` · `/admin/*` pages ·
**Serves:** F11 (operator: availability), F12 (operator: session day), F13 (operator: refunds) ·
**Status:** 🟡 code-complete, not live-verified

## What it does

Every operator action for the solo tutor: publish availability, run the bookings calendar, resolve
no-show credit-return requests, manage users, author practice questions, issue refund/ledger
adjustments, work the manual SMS-reminder list, and write session notes → written plan.

## The gate (`guard.ts`)

`requireAdmin()` is the first line of every admin server action — checks the signed-in caller's
`accounts.is_admin`, returns `{ ok: false }` (never throws) if absent or not admin. This is the
**cheap early rejection**; the real enforcement is the `*_admin_read`/`*_admin_write` RLS policies
added in migration `0010` — a bug in `requireAdmin` couldn't bypass them (`AT-SEC-002`, `CON2`).
Every file below follows the same shape: call `requireAdmin()` first, bail to a safe empty/denied
result if it fails, otherwise proceed using the **admin's own RLS-scoped client** (not the
service-role client) so the cross-account read is legitimated by the `_admin_read` policy, not by
bypassing RLS altogether. The one exception is `questions.ts` (see below).

## Surfaces

- **`availability.ts`** — `publishAvailabilityRule` / `publishAvailabilityException` (F11): write
  `availability_rules`/`availability_exceptions`, which `booking.md`'s `generateSlots` reads.
- **`bookings.ts`** — `listAllBookings` (every booking, not just the caller's — the admin calendar +
  missing-Meet-link queue, since a `meet_url: null` row is visible here), `markNoShow` (calls the
  `mark_no_show` RPC, `booking.md`).
- **`credit-returns.ts`** — `listPendingCreditReturns` / (a resolve action calling
  `resolve_credit_return_request`, `booking.md`) — the no-show credit-return queue (F10/F13).
- **`refunds.ts`** — `issueRefund`, calls the `refund_credit` RPC. Pairs a **manual** Stripe refund
  (done by the operator in the Stripe dashboard) with a ledger adjustment in the same admin action,
  so wallet and Stripe balances can't silently drift — there is no self-serve refund path anywhere
  in the system (`ADR-003`, F13).
- **`questions.ts`** — practice-question CRUD. Writes go through the **service-role client**
  deliberately: `questions` grants writes only to `service_role` (`practice.md`'s answer-secrecy
  model), so an admin RLS policy that could write `answer`/`tolerance`/`explanation` would punch a
  hole in that boundary. `requireAdmin()` is still the actual gate; the service-role client is just
  the mechanism.
- **`users.ts`** — `listUsers`, via the `accounts_admin_read` policy.
- **`reminders.ts`** (`0011_sms_worklist.sql`) — `listSmsWorklist` / `markSmsSent`. **A worklist, not
  an integration** (`REQ-ADMIN-004`) — lists every booking in the next 48h, soonest first, with the
  exact message text and the buyer's phone (if they've set one on `/profiles`); the operator sends
  the text by hand and clicks "mark sent" (`mark_sms_sent` RPC). No Twilio/SMS API call happens
  anywhere in this path.
- **`plans.ts`** — `setSessionNotes` (writes via `set_session_notes` RPC) and `getBookingPlan`, which
  assembles a booking's `assessment.md`-produced context (stated `goal`, wrong assessment items by
  depth) plus free-text session notes and renders it through `renderPlan` (`assessment.md`) — the
  written plan an admin reviews/sends within 48h (`REQ-FIRST-006/007`).
- **`time-remaining.ts`** — pure helper, minutes-until-session math shared by the worklist/queue UIs.

## Migration `0010_admin.sql`

Adds cross-account `_admin_read` (and where needed `_admin_write`) RLS policies gated on
`accounts.is_admin`, plus the `refund_credit` `SECURITY DEFINER` RPC (ledger-adjustment half of a
manual refund).

## What depends on it

`/admin/*` pages (availability editor, bookings calendar, credit-return queue, users, question CRUD,
reminders worklist, `/admin/bookings/[id]` plan page).
