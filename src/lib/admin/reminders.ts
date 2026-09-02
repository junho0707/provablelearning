"use server";

import { z } from "zod";
import { requireAdmin } from "./guard";
import type { AdminResult } from "./availability";

export type SmsWorklistEntry = {
  bookingId: string;
  startsAt: string;
  phone: string | null;
  message: string;
  sent: boolean;
  minutesRemaining: number;
};

/**
 * TASK-ADMIN-002, REQ-ADMIN-004. A worklist, not an integration — lists every upcoming session in
 * the next 48h (a manually-workable horizon) ordered by urgency (soonest first, AT-ADMIN-002), with
 * the exact message to send and the buyer's phone if they've provided one.
 */
export async function listSmsWorklist(): Promise<SmsWorklistEntry[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const { data: bookings } = await admin.supabase
    .from("bookings")
    .select("id, starts_at, sms_sent, account_id, learner_profiles(name)")
    .eq("status", "booked")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", horizon.toISOString())
    .order("starts_at", { ascending: true });
  if (!bookings || bookings.length === 0) return [];

  const accountIds = [...new Set(bookings.map((b) => b.account_id))];
  const { data: accounts } = await admin.supabase.from("accounts").select("id, phone").in("id", accountIds);
  const phoneByAccount = new Map((accounts ?? []).map((a) => [a.id, a.phone as string | null]));

  return bookings.map((b) => {
    const profile = b.learner_profiles as unknown as { name: string } | { name: string }[] | null;
    const learnerName = Array.isArray(profile) ? (profile[0]?.name ?? "your session") : (profile?.name ?? "your session");
    const startsAt = new Date(b.starts_at);
    return {
      bookingId: b.id,
      startsAt: b.starts_at,
      phone: phoneByAccount.get(b.account_id) ?? null,
      message: `Reminder: ${learnerName}'s tutoring session is at ${startsAt.toLocaleString()}.`,
      sent: b.sms_sent,
      minutesRemaining: Math.round((startsAt.getTime() - now.getTime()) / 60000),
    };
  });
}

export async function markSmsSent(bookingId: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsed = z.string().uuid().safeParse(bookingId);
  if (!parsed.success) return { ok: false, message: "Invalid booking id." };

  const { error } = await admin.supabase.rpc("mark_sms_sent", { p_booking_id: parsed.data });
  if (error) return { ok: false, message: "Could not mark that as sent." };
  return { ok: true };
}
