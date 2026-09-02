import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmation, sendReminder } from "./email";

/**
 * TASK-NOTIFY-001. Runs after `attachCalendarEvent` so the confirmation email can include the Meet
 * link when Google succeeded quickly (best-effort — nothing here changes booking state, so a
 * failure is just a missed email, never a broken booking).
 */
export async function sendBookingConfirmationEmail(bookingId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("starts_at, meet_url, account_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return;

  const { data: authUser } = await admin.auth.admin.getUserById(booking.account_id);
  const email = authUser?.user?.email;
  if (!email) return;

  await sendBookingConfirmation({ to: email, startsAt: booking.starts_at, meetUrl: booking.meet_url });
}

type ReminderKind = "reminded_24h" | "reminded_1h";

/**
 * TASK-NOTIFY-001, contract `GET /api/cron/session-reminders`. Sends the reminder for one booking
 * and flips its idempotency flag **only on a successful send** — a failed send is retried on the
 * next cron tick instead of being silently lost; a flipped flag is what makes a rerun a no-op
 * (AT-NOTIFY-001).
 */
export async function sendReminderForBooking(
  booking: { id: string; starts_at: string; meet_url: string | null; account_id: string },
  hoursOut: 24 | 1,
  flagColumn: ReminderKind,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(booking.account_id);
  const email = authUser?.user?.email;
  if (!email) return false;

  const sent = await sendReminder({ to: email, startsAt: booking.starts_at, meetUrl: booking.meet_url, hoursOut });
  if (sent) {
    await admin.from("bookings").update({ [flagColumn]: true }).eq("id", booking.id);
  }
  return sent;
}
