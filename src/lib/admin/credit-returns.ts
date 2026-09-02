"use server";

import { z } from "zod";
import { requireAdmin } from "./guard";
import type { AdminResult } from "./availability";

export type CreditReturnRequest = {
  id: string;
  bookingId: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  buyerEmail: string;
  studentName: string;
  sessionStartsAt: string;
  /** Returns this student has left this month. Approving at 0 is refused by the database. */
  allowanceRemaining: number;
};

/** The credit-return queue (F10 step 4, F12 step 5). */
export async function listPendingCreditReturns(): Promise<CreditReturnRequest[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const { data: requests } = await admin.supabase
    .from("credit_return_requests")
    .select("id, booking_id, reason, status, account_id, bookings(starts_at, profile_id, learner_profiles(name))")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!requests) return [];

  const accountIds = [...new Set(requests.map((r) => r.account_id))];
  const { data: accounts } = await admin.supabase.from("accounts").select("id, email").in("id", accountIds);
  const emailByAccount = new Map((accounts ?? []).map((a) => [a.id, a.email]));

  type BookingJoin = { starts_at: string; profile_id: string; learner_profiles: { name: string } | { name: string }[] | null };
  const unwrap = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  // The allowance is what makes the decision, so it is shown next to the request rather than left
  // for the operator to work out (INV-CREDIT-2).
  const allowances = new Map<string, number>();
  const profileIds = [
    ...new Set(
      requests
        .map((r) => unwrap(r.bookings as unknown as BookingJoin)?.profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  await Promise.all(
    profileIds.map(async (profileId) => {
      const { data } = await admin.supabase.rpc("credit_return_allowance", { p_profile_id: profileId });
      allowances.set(profileId, typeof data === "number" ? data : 0);
    }),
  );

  return requests.map((r) => {
    const booking = unwrap(r.bookings as unknown as BookingJoin);
    const profile = booking ? unwrap(booking.learner_profiles) : null;
    return {
      id: r.id,
      bookingId: r.booking_id,
      reason: r.reason,
      status: r.status,
      buyerEmail: emailByAccount.get(r.account_id) ?? "—",
      studentName: profile?.name ?? "—",
      sessionStartsAt: booking?.starts_at ?? "",
      allowanceRemaining: booking ? (allowances.get(booking.profile_id) ?? 0) : 0,
    };
  });
}

const decisionSchema = z.enum(["approved", "denied"]);

/** TASK-ADMIN-001, contract `resolveCreditReturnRequest`. Approving credits the ledger exactly once (audited). */
export async function resolveCreditReturnRequest(requestId: string, decision: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsedId = z.string().uuid().safeParse(requestId);
  const parsedDecision = decisionSchema.safeParse(decision);
  if (!parsedId.success || !parsedDecision.success) return { ok: false, message: "Invalid request." };

  const { error } = await admin.supabase.rpc("resolve_credit_return_request", {
    p_request_id: parsedId.data,
    p_decision: parsedDecision.data,
  });
  if (error) return { ok: false, message: "Could not resolve that request." };
  return { ok: true };
}
