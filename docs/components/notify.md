# Notify — transactional email & reminder cron

**Code:** `src/lib/notify/{email,booking}.ts` · `src/app/api/cron/session-reminders/route.ts` ·
`supabase/migrations/0009_notifications.sql` · **Serves:** F5, F7 (receipts), F8 (booking
confirmation + reminders) · **Status:** 🟡 code-complete, not live-verified

## What it does

Resend for all transactional mail (`spec/14` §12 — email only, no SMS integration; see `admin.md`
for the SMS worklist). A cron endpoint scans for due, not-yet-sent reminders and sends them
idempotently.

## How it fits together

- **`email.ts`** — the three actual senders: `sendBookingConfirmation`, `sendReminder`,
  `sendReceipt`. Each wraps its Resend call in try/catch and **returns a boolean, never throws** —
  the same resilience posture as `booking.md`'s `createCalendarEvent`, since a failed send must not
  break the purchase/booking flow that triggered it. `resendClient()` is constructed lazily so
  importing the module doesn't require `RESEND_API_KEY` at build time.
- **`booking.ts`** — orchestration on top of the raw senders:
  - `sendBookingConfirmationEmail(bookingId)` — looks up the booking + buyer email via the
    **admin client** (runs after commit, outside any buyer's RLS context), includes the Meet link if
    `attachCalendarEvent` (`booking.md`) already populated it. Nothing here changes booking state, so
    a send failure is just a missed email, never a broken booking.
  - `sendReminderForBooking(booking, hoursOut, flagColumn)` — sends, then flips the booking's
    `reminded_24h`/`reminded_1h` flag **only on a successful send**. A failed send leaves the flag
    `false` so the next cron tick retries it; a flipped flag is what makes a rerun a no-op.

## Migration `0009_notifications.sql`

Adds `bookings.reminded_24h` and `bookings.reminded_1h` (both `boolean not null default false`) —
one flag per reminder kind, flipped only after a confirmed send. This is the entire idempotency
mechanism: the cron scans for `false` in the relevant time window, so re-running before the flag
flips is the only way to double-send, and re-running after is a guaranteed no-op.

## The cron (`GET /api/cron/session-reminders`)

Secret-guarded (`Authorization: Bearer $CRON_SECRET`, `401` otherwise) — any scheduler (Vercel Cron)
calls it on a cadence. For each of the 24h and 1h offsets: queries `bookings` where
`status = 'booked'`, the relevant flag is `false`, and `starts_at` falls in a **±30min window**
around `now + offset` (tolerant of cron not firing at the exact minute), then calls
`sendReminderForBooking` per row. Returns `{ sent24h, sent1h }` counts.

## What depends on it

`book.ts`'s `bookSession` (confirmation email), the cron route (reminders), `billing.ts`'s webhook
handler (`sendReceipt`, only on a genuine first processing — see `billing.md`).
