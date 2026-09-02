"use server";

import { createClient } from "@/lib/supabase/server";

export type MyBooking = {
  id: string;
  startsAt: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
  meetUrl: string | null;
  profileName: string;
  /** Mirrors `request_credit_return`'s own test, so the UI never offers a button the RPC rejects. */
  canRequestReturn: boolean;
  returnRequestStatus: "pending" | "approved" | "denied" | null;
};

/** TASK-BOOK-004. RLS-scoped to the caller's own bookings (`bookings_select_own`). */
export async function getMyBookings(): Promise<MyBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, starts_at, status, meet_url, learner_profiles(name)")
    .order("starts_at", { ascending: false });
  if (error || !data) return [];

  // A late cancel is a cancelled booking with no `cancel_refund` row — see migration 0015.
  const [{ data: refunds }, { data: requests }] = await Promise.all([
    supabase.from("credit_ledger").select("booking_id").eq("reason", "cancel_refund"),
    supabase.from("credit_return_requests").select("booking_id, status"),
  ]);
  const refunded = new Set((refunds ?? []).map((r) => r.booking_id));
  const requestStatus = new Map(
    (requests ?? []).map((r) => [r.booking_id, r.status as MyBooking["returnRequestStatus"]]),
  );

  return data.map((row) => {
    const profile = row.learner_profiles as unknown as { name: string } | { name: string }[] | null;
    const profileName = Array.isArray(profile) ? (profile[0]?.name ?? "—") : (profile?.name ?? "—");
    const creditBurned =
      row.status === "no_show" || (row.status === "cancelled" && !refunded.has(row.id));
    const returnRequestStatus = requestStatus.get(row.id) ?? null;

    return {
      id: row.id,
      startsAt: row.starts_at,
      status: row.status,
      meetUrl: row.meet_url,
      profileName,
      canRequestReturn:
        creditBurned && returnRequestStatus !== "pending" && returnRequestStatus !== "approved",
      returnRequestStatus,
    };
  });
}
