import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderForBooking } from "@/lib/notify/booking";
import { adminLink, alertTime, notifyOperator } from "@/lib/notify/slack";
import { MATERIALS_DUE_HOURS } from "@/lib/policy";

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

  // The whole tick is wrapped because this route is the one piece of the system nobody is looking
  // at: a throw here is silent forever otherwise, and the first symptom is a parent who got no
  // reminder for a session that already happened.
  try {
    const sent24h = await sendDueReminders(admin, now, 24, "reminded_24h");
    const sent1h = await sendDueReminders(admin, now, 1, "reminded_1h");
    const overdue = await alertNewlyOverdueMaterials(admin, now);

    const failed = sent24h.failed + sent1h.failed;
    if (failed > 0) {
      await notifyOperator(
        `:rotating_light: *${failed} session reminder${failed === 1 ? "" : "s"} failed to send.* They retry on the next tick; if this repeats, check Resend.`,
      );
    }

    await pingHeartbeat();
    return NextResponse.json({ sent24h: sent24h.sent, sent1h: sent1h.sent, overdue });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await notifyOperator(`:rotating_light: *Reminder cron failed* — no reminders went out this hour.\n> ${message}`);
    return NextResponse.json({ error: { code: "cron_failed", message } }, { status: 500 });
  }
}

/**
 * The dead-man's switch. Pinged **only** after a tick that actually completed, so the external
 * monitor alerts when no ping arrives.
 *
 * This is the failure the in-app alerting cannot cover by construction: if the deployment is down,
 * or Vercel simply stops firing the schedule, there is no code of ours left running to notice. A
 * failure of the ping itself is ignored — the monitor going quiet *is* the alarm.
 */
async function pingHeartbeat(): Promise<void> {
  const url = process.env.CRON_HEARTBEAT_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "GET" });
  } catch {
    // Deliberately swallowed: a missed heartbeat is reported by the monitor, not by us.
  }
}

async function sendDueReminders(
  admin: ReturnType<typeof createAdminClient>,
  now: number,
  hoursOut: 24 | 1,
  flagColumn: "reminded_24h" | "reminded_1h",
): Promise<{ sent: number; failed: number }> {
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
  let failed = 0;
  for (const booking of due ?? []) {
    const ok = await sendReminderForBooking(booking, hoursOut, flagColumn);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

/**
 * Sessions that crossed the 24-hour materials target during this tick (`02-POLICIES.md` §9).
 *
 * The band is exactly one hour wide and the cron is hourly, so the bands tile: each session is
 * announced once, as it goes overdue, instead of every hour it stays overdue. `/admin/materials`
 * remains the list of everything outstanding — this only says one just crossed the line.
 */
async function alertNewlyOverdueMaterials(
  admin: ReturnType<typeof createAdminClient>,
  now: number,
): Promise<number> {
  const dueMs = MATERIALS_DUE_HOURS * 60 * 60 * 1000;
  const bandEnd = new Date(now - dueMs).toISOString();
  const bandStart = new Date(now - dueMs - 60 * 60 * 1000).toISOString();

  const { data: crossed } = await admin
    .from("bookings")
    .select("id, starts_at, learner_profiles(name)")
    .in("status", ["booked", "completed"])
    .gte("starts_at", bandStart)
    .lt("starts_at", bandEnd);
  if (!crossed?.length) return 0;

  const { data: materials } = await admin
    .from("post_session_materials")
    .select("booking_id, published_at")
    .in("booking_id", crossed.map((b) => b.id));
  const published = new Set(
    (materials ?? []).filter((m) => m.published_at).map((m) => m.booking_id as string),
  );

  let alerted = 0;
  for (const booking of crossed) {
    if (published.has(booking.id)) continue;
    const profile = booking.learner_profiles as unknown as { name: string } | { name: string }[] | null;
    const name = Array.isArray(profile) ? (profile[0]?.name ?? "a student") : (profile?.name ?? "a student");
    await notifyOperator(
      `:hourglass: *Materials overdue* — ${name}, session ${alertTime(booking.starts_at)}, now past the ${MATERIALS_DUE_HOURS}-hour target.\n${adminLink("/admin/materials")}`,
    );
    alerted++;
  }
  return alerted;
}
