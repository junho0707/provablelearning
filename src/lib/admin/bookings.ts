"use server";

import { z } from "zod";
import { requireAdmin } from "./guard";
import type { AdminResult } from "./availability";

export type AdminBooking = {
  id: string;
  startsAt: string;
  status: string;
  meetUrl: string | null;
  buyerEmail: string;
  learnerName: string;
};

/** TASK-ADMIN-001, "bookings calendar" — every booking, not just the caller's own (uses `bookings_admin_read`). */
export async function listAllBookings(): Promise<AdminBooking[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const { data: bookings } = await admin.supabase
    .from("bookings")
    .select("id, starts_at, status, meet_url, account_id, learner_profiles(name)")
    .order("starts_at", { ascending: true });
  if (!bookings) return [];

  const accountIds = [...new Set(bookings.map((b) => b.account_id))];
  const { data: accounts } = await admin.supabase.from("accounts").select("id, email").in("id", accountIds);
  const emailByAccount = new Map((accounts ?? []).map((a) => [a.id, a.email]));

  return bookings.map((b) => {
    const profile = b.learner_profiles as unknown as { name: string } | { name: string }[] | null;
    const learnerName = Array.isArray(profile) ? (profile[0]?.name ?? "—") : (profile?.name ?? "—");
    return {
      id: b.id,
      startsAt: b.starts_at,
      status: b.status,
      meetUrl: b.meet_url,
      buyerEmail: emailByAccount.get(b.account_id) ?? "—",
      learnerName,
    };
  });
}

/** TASK-ADMIN-001, contract `markNoShow`. F10/F12. */
export async function markNoShow(bookingId: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsed = z.string().uuid().safeParse(bookingId);
  if (!parsed.success) return { ok: false, message: "Invalid booking id." };

  const { error } = await admin.supabase.rpc("mark_no_show", { p_booking_id: parsed.data });
  if (error) return { ok: false, message: "Could not mark that booking as a no-show." };
  return { ok: true };
}
