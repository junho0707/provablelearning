# waitlist-notify-sg-next — `notifySgWaitlistNext`

## Purpose

For SG / 1:1 waitlist entries, find the next FIFO `waiting` student whose `preferred_class_ids` contains the freshly opened class **and** has at least 2 of their preferred slots open. Move them to `notified` with a 3-day offer window. Send the offer email and an in-app notification.

## Behavior

- Walks `waiting` SG/1:1 entries (rows where `class_id IS NULL`) in `created_at` order; filters to those whose `preferred_class_ids` contains the triggering `classId`.
- For each candidate, counts capacity per preferred class against `enrollments` in `pending`/`active` status (via the relevant slot columns). Continues if fewer than 2 are open.
- Optimistic update: `UPDATE waitlist SET status='notified', notified_at=now(), offer_expires_at=now()+3d WHERE id=… AND status='waiting'` — race-safe.
- Inserts a `notifications` row addressed to the parent (or independent student).
- Calls `sendWaitlistOfferEmail`.

## Inputs / outputs / side effects

- **Input:** `classId` (the class whose seat just opened).
- **Output:** `boolean` — `true` if someone was notified.
- **Side effects:** `waitlist` UPDATE, `notifications` INSERT, email send.

## Related: `auto_enroll_sg_from_waitlist` RPC

The cron sweep also calls the SQL RPC `auto_enroll_sg_from_waitlist` to **actually create the enrollment** for the FIFO waiter when 2 open preferred slots exist on **distinct meeting days** (I-33, I-15). The two paths together implement notify-then-accept while protecting against same-day dual-slot enrollment.

## File paths

- `src/lib/waitlist/notify-sg-next.ts`
- `src/lib/waitlist/send-waitlist-notification.ts`
- `supabase/migrations/00091_sg_fixes.sql` — `auto_enroll_sg_from_waitlist` definition (with distinct-day requirement)

## Journeys that use it

- [enroll](../journeys/enroll.md) — SG seat-opens and offer-accept paths.
