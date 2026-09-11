"use server";

import { createClient } from "@/lib/supabase/server";
import type { LedgerEntry, Purchase } from "./types";

/** TASK-BILLING-002. RLS-scoped to the caller's own rows (`purchases_select_own`/`credit_ledger_select_own`). */
export async function getPurchaseHistory(): Promise<Purchase[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchases")
    .select("id, sku, amount_cents, created_at")
    .order("created_at", { ascending: false });
  // Logged rather than swallowed: this read failed silently for a while against a column ADR-007
  // had renamed, and an empty list is indistinguishable from "no purchases yet" on the page.
  if (error) console.error("getPurchaseHistory", error.message);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    sku: row.sku,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
  }));
}

export async function getLedgerHistory(): Promise<LedgerEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_ledger")
    .select("id, delta, reason, created_at")
    .order("created_at", { ascending: false });
  if (error) console.error("getLedgerHistory", error.message);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
