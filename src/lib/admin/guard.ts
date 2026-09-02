import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminSession = { ok: true; supabase: SupabaseClient; adminId: string } | { ok: false };

/**
 * TASK-ADMIN-001. Every admin server action starts here (AT-SEC-002: a non-admin is denied every
 * admin surface and action). Checks `accounts.is_admin` for the signed-in caller — the RLS
 * policies added in migration 0010 are the real enforcement; this is the early, cheap rejection so
 * a non-admin never even reaches a query.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: account } = await supabase.from("accounts").select("is_admin").eq("id", user.id).maybeSingle();
  if (!account?.is_admin) return { ok: false };

  return { ok: true, supabase, adminId: user.id };
}
