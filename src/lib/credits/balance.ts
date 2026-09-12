"use server";

import { getAuthUser } from "@/lib/auth/session";

/**
 * TASK-CREDIT-001. Balance is `Σ credit_ledger.delta` for the caller, computed in Postgres
 * (`get_balance()`, migration 0004) under the same RLS scoping a direct select would get — never
 * a stored counter (INV-MONEY-1). Returns 0 for a signed-out caller rather than erroring, since a
 * balance display is a read, not an auth gate.
 */
export async function getBalance(): Promise<number> {
  const { supabase, user } = await getAuthUser();
  if (!user) return 0;

  const { data, error } = await supabase.rpc("get_balance");
  if (error || data === null) return 0;
  return data as number;
}
