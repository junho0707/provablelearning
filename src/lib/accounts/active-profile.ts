"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Which learner profile the buyer is currently viewing/acting as (spec/05_FLOWS "switching
 * profiles switches the progress view"). Stored as a plain cookie, not a DB column — there is
 * nothing in `07_DATA_MODEL` for it, and it's UI state, not a fact about the account.
 */
const COOKIE = "active_profile_id";

export async function getActiveProfileId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE)?.value ?? null;
}

/** Switches the active profile. Denied if the profile doesn't belong to the caller (RLS-checked). */
export async function setActiveProfile(profileId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learner_profiles")
    .select("id")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(COOKIE, profileId, { path: "/", sameSite: "lax" });
  return { ok: true };
}
