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
};

/** TASK-ADMIN-001/BOOK-005, "no-show credit-return request queue". */
export async function listPendingCreditReturns(): Promise<CreditReturnRequest[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const { data: requests } = await admin.supabase
    .from("credit_return_requests")
    .select("id, booking_id, reason, status, account_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!requests) return [];

  const accountIds = [...new Set(requests.map((r) => r.account_id))];
  const { data: accounts } = await admin.supabase.from("accounts").select("id, email").in("id", accountIds);
  const emailByAccount = new Map((accounts ?? []).map((a) => [a.id, a.email]));

  return requests.map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    reason: r.reason,
    status: r.status,
    buyerEmail: emailByAccount.get(r.account_id) ?? "—",
  }));
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
