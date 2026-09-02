"use server";

import { createClient } from "@/lib/supabase/server";
import type { LedgerEntry, Purchase } from "./types";

/** TASK-BILLING-002. RLS-scoped to the caller's own rows (`purchases_select_own`/`credit_ledger_select_own`). */
export async function getPurchaseHistory(): Promise<Purchase[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchases")
    .select("id, sku, amount_cents, goal, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    sku: row.sku,
    amountCents: row.amount_cents,
    goal: row.goal,
    createdAt: row.created_at,
  }));
}

export async function getLedgerHistory(): Promise<LedgerEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_ledger")
    .select("id, delta, reason, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
