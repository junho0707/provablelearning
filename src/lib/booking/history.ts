"use server";

import { createClient } from "@/lib/supabase/server";

export type MyBooking = {
  id: string;
  profileId: string;
  startsAt: string;
  purpose: string | null;
  subPurpose: string | null;
  specifics: string | null;
  status: "booked" | "cancelled" | "completed" | "no_show";
  profileName: string;
  /** Mirrors `request_credit_return`'s own test, so the UI never offers a button the RPC rejects. */
  /** The credit was spent and not returned — a no-show, or a cancellation inside the minimum notice. */
  creditBurned: boolean;
  canRequestReturn: boolean;
  returnRequestStatus: "pending" | "approved" | "denied" | null;
  /** Credit returns this student has left this calendar month (INV-CREDIT-2). */
  allowanceRemaining: number;
};

/** TASK-BOOK-004. RLS-scoped to the caller's own bookings (`bookings_select_own`). */
export async function getMyBookings(): Promise<MyBooking[]> {
  const supabase = await createClient();

  // Neither of these depends on the bookings row set, so they run alongside it instead of after
  // it — three round trips in one stage instead of two stages back to back.
  const [
    { data, error },
    { data: refunds },
    { data: requests },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, profile_id, starts_at, status, purpose, sub_purpose, specifics, learner_profiles(name)")
      .order("starts_at", { ascending: false }),
    // A late cancel is a cancelled booking with no `cancel_refund` row — see migration 0015.
    supabase.from("credit_ledger").select("booking_id").eq("reason", "cancel_refund"),
    supabase.from("credit_return_requests").select("booking_id, status"),
  ]);
  if (error || !data) return [];
  const refunded = new Set((refunds ?? []).map((r) => r.booking_id));

  // One allowance lookup per student, not per booking — the cap is per student per month.
  const profileIds = [...new Set(data.map((row) => row.profile_id as string))];
  const allowances = new Map<string, number>();
  await Promise.all(
    profileIds.map(async (profileId) => {
      const { data: remaining } = await supabase.rpc("credit_return_allowance", {
        p_profile_id: profileId,
      });
      allowances.set(profileId, typeof remaining === "number" ? remaining : 0);
    }),
  );
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
      profileId: row.profile_id,
      startsAt: row.starts_at,
      purpose: row.purpose ?? null,
      subPurpose: row.sub_purpose ?? null,
      specifics: row.specifics ?? null,
      status: row.status,
      profileName,
      creditBurned,
      // Mirrors `request_credit_return` exactly, so the UI never offers a button the RPC rejects
      // — including the cap, which refuses to create a request at all once it is used up.
      canRequestReturn:
        creditBurned &&
        returnRequestStatus !== "pending" &&
        returnRequestStatus !== "approved" &&
        (allowances.get(row.profile_id as string) ?? 0) > 0,
      returnRequestStatus,
      allowanceRemaining: allowances.get(row.profile_id as string) ?? 0,
    };
  });
}
