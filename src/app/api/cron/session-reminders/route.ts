import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderForBooking } from "@/lib/notify/booking";

const WINDOW_MS = 60 * 60 * 1000; // ±1h window around each reminder's exact offset, cron cadence tolerant

/**
 * TASK-NOTIFY-001, contract `GET /api/cron/session-reminders`. Secret-guarded — Vercel Cron (or
 * any scheduler) calls this on a schedule; each reminder kind is idempotent via its own
 * `reminded_24h`/`reminded_1h` flag (AT-NOTIFY-001), so overlapping or re-run invocations are safe.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "denied", message: "Unauthorized." } }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();

  const sent24h = await sendDueReminders(admin, now, 24, "reminded_24h");
  const sent1h = await sendDueReminders(admin, now, 1, "reminded_1h");

  return NextResponse.json({ sent24h, sent1h });
}

async function sendDueReminders(
  admin: ReturnType<typeof createAdminClient>,
  now: number,
  hoursOut: 24 | 1,
  flagColumn: "reminded_24h" | "reminded_1h",
): Promise<number> {
  const offsetMs = hoursOut * 60 * 60 * 1000;
  const windowStart = new Date(now + offsetMs - WINDOW_MS / 2).toISOString();
  const windowEnd = new Date(now + offsetMs + WINDOW_MS / 2).toISOString();

  const { data: due } = await admin
    .from("bookings")
    .select("id, starts_at, meet_url, account_id")
    .eq("status", "booked")
    .eq(flagColumn, false)
    .gte("starts_at", windowStart)
    .lt("starts_at", windowEnd);

  let sent = 0;
  for (const booking of due ?? []) {
    const ok = await sendReminderForBooking(booking, hoursOut, flagColumn);
    if (ok) sent++;
  }
  return sent;
}
