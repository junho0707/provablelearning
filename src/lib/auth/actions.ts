"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * TASK-AUTH-001: Google OAuth + magic link, no passwords (spec/14 §11). Both methods land on the
 * same `/auth/callback` route, which exchanges the code for a session; Supabase links the two
 * identities automatically when the email matches.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export type MagicLinkState = { status: "idle" | "sent" | "error"; message?: string };

/** Form action for `useActionState` — returns state instead of throwing, so the page can render feedback. */
export async function sendMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "Enter an email address." };
  const next = String(formData.get("next") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
    },
  });
  if (error) return { status: "error", message: "Couldn't send the link. Try again." };
  return { status: "sent" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
