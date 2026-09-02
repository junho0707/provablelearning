"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const phoneSchema = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.");

/**
 * Spec gap closed for TASK-ADMIN-002 (see migration 0011) — the buyer's own phone number, so the
 * admin SMS worklist has a number to text. Optional; nothing depends on it being set.
 */
export async function setPhone(phone: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = phoneSchema.safeParse(phone);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid phone number." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in required." };

  const { error } = await supabase.from("accounts").update({ phone: parsed.data }).eq("id", user.id);
  if (error) return { ok: false, message: "Could not save that number." };
  return { ok: true };
}
