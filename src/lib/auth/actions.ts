"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Buyer sign-in (F1). Email-first: one field decides the method, because only the server knows
 * which method an address has.
 *
 * A buyer arrives by Google, by magic link, or by a password they set after their first magic-link
 * click. Asking them to pick would mean asking them to remember; instead the form asks for the
 * email, `email_has_password` (migration 0026) answers in one bit, and the form then shows a
 * password box or sends a link. The link's landing page offers to set a password, so the second
 * visit is a password visit.
 *
 * Google stays a separate button: it never needs the address typed first.
 *
 * A password must never become a locked door: `email_has_password` keeps answering true once one is
 * set, so without a way back the password box would be the only step a buyer ever sees. "Forgot
 * password?" re-posts the same form and takes the link branch regardless.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export type SignInState =
  | { status: "idle" }
  /** The address has a password — collect it. `email` is echoed so step two can post it back. */
  | { status: "password"; email: string; message?: string }
  /** No password (or no account): a magic link is on its way. */
  | { status: "sent" }
  | { status: "error"; message: string };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "Enter an email address." };
  const next = String(formData.get("next") ?? "");
  const password = String(formData.get("password") ?? "");
  // Set by the "Forgot password?" button on step two, which posts the same form without a password.
  const forgot = Boolean(formData.get("forgot"));

  const supabase = await createClient();

  if (password && !forgot) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { status: "password", email, message: "That password didn't match." };
    redirect(next || "/dashboard");
  }

  if (!forgot) {
    const { data: hasPassword } = await supabase.rpc("email_has_password", { p_email: email });
    if (hasPassword) return { status: "password", email };
  }

  // A link is the way in: either no password exists, or they forgot the one that does. The
  // forgotten case has to land on `/set-password` explicitly — the callback offers that page on its
  // own only to buyers who have no password, which is exactly who this buyer is not.
  const landing = forgot ? `/set-password?next=${encodeURIComponent(next || "/dashboard")}` : next;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback${landing ? `?next=${encodeURIComponent(landing)}` : ""}`,
    },
  });
  if (error) return { status: "error", message: "Couldn't send the link. Try again." };
  return { status: "sent" };
}

export type SetPasswordState = { status: "idle" | "error"; message?: string };

/** Sets the password for the already-signed-in buyer, then continues where they were headed. */
export async function setPassword(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "") || "/dashboard";
  if (password.length < 8) return { status: "error", message: "Use at least 8 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", message: "Couldn't save that password. Try again." };

  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
