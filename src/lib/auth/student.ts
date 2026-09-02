"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { studentEmail } from "@/lib/accounts/student-identity";
import { usernameSchema } from "@/lib/accounts/types";

/**
 * Student sign-in (`system/05-SURFACES.md` §3). Separate from the buyer's `/login` in every
 * respect: username and password rather than OAuth or a magic link, no self-registration, and no
 * self-service reset — a forgotten password is reset by the parent (INV-AUTH-1).
 */

export type StudentSignInState = { status: "idle" | "error"; message?: string };

export async function signInStudent(
  _prev: StudentSignInState,
  formData: FormData,
): Promise<StudentSignInState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!usernameSchema.safeParse(username).success || !password) {
    return { status: "error", message: "Check the username and password and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: studentEmail(username),
    password,
  });

  if (error) {
    // A banned user is one whose household has not paid yet, so consent has never been recorded
    // (`system/06-AUTH-AND-COPPA.md` §3). Say so plainly — "wrong password" would send a parent
    // hunting for a problem that isn't there.
    const banned = error.message.toLowerCase().includes("banned");
    return {
      status: "error",
      message: banned
        ? "This account isn't active yet. It opens once a parent books the first session."
        : "That username and password don't match.",
    };
  }

  redirect("/student");
}

export async function signOutStudent() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/student/login");
}
