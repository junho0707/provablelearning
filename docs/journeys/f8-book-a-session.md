# F8 — Book a session

**Actor:** Buyer · **Status:** 🟡 code-complete, not live-verified (`TASK-AVAIL-001`, `TASK-BOOK-001..005`) — critical
path, alongside F7.

## Trigger

Has ≥1 credit, picks a learner profile and an open slot.

## Steps

1. Slots are shown in the **buyer's own browser time zone**, though stored in UTC
   (`spec/07_DATA_MODEL.md`). Only slots **≥24h out and ≤4 weeks ahead** are offered.
2. `book_session` RPC runs as **one transaction**: row-lock the slot → verify it's still open →
   verify balance ≥ 1 → spend one credit → reserve the slot. Concurrent attempts yield exactly one
   booking and one spend (`INV-BOOK-1`).
3. **After commit** — not inside the transaction — the system creates the Calendar event + Meet
   link and sends the Resend confirmation.
4. **If Google fails:** the booking stands with a null `meet_url`, surfaced on the admin queue for
   manual repair. The booking is **never** rolled back over a Calendar failure (`INV-BOOK-2`,
   `REQ-BOOK-006`).
5. Reminders fire at **24h** and **1h** before the session, each idempotently (a sent-flag per
   reminder, not a re-send on every cron tick).

## Guards / invariants

- `INV-BOOK-1` (slot lock, same transaction as the spend) and `INV-BOOK-2` (`meet_url` nullable by
  design) are both load-bearing here — see `02-invariants.md` for why each can't be "simplified."

## Failure paths

- Concurrent booking attempts on the same slot → the row lock serializes them; the loser sees "slot
  no longer available," not a double-booked session or a spent-but-unbooked credit.
- Google Calendar outage → booking commits anyway; `meet_url` stays null until the admin queue
  repairs it (`components` for admin ops not yet built).

## Requirements / tests

`REQ-BOOK-001, 002, 006`, `REQ-NOTIFY-001` · `AT-BOOK-001, 002, 004, 005, 006`.

## Components

Not yet built. Will need `booking` (the RPC + slot derivation) and depends on `credits` (F7) for
the atomic spend, and `notifications` for confirmation/reminder email.
