"use server";

import { z } from "zod";
import { requireAdmin } from "./guard";
import type { AdminResult } from "./availability";

const inputSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.number().int().refine((n) => n !== 0, "Amount can't be zero."),
  note: z.string().trim().min(1).max(500),
});

/**
 * TASK-ADMIN-001, contract `issueRefund`. Pairs a manual Stripe refund with a ledger adjustment so
 * the wallet and Stripe can't drift (ADR-003) — there is no self-serve refund path (F13).
 */
export async function issueRefund(input: unknown): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid adjustment." };

  const { error } = await admin.supabase.rpc("refund_credit", {
    p_account_id: parsed.data.accountId,
    p_amount: parsed.data.amount,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, message: "Could not apply that adjustment." };
  return { ok: true };
}
