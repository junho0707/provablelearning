"use server";

import { redirect } from "next/navigation";
import { createProfile } from "./profiles";
import { setStudentCredentials } from "./student-credentials";
import { deleteStudent } from "./consent";
import type { ProfileInput } from "./types";

/**
 * Add a student, give them their sign-in, and land the buyer on the dashboard — one call, one
 * round trip, one navigation (F2).
 *
 * The two halves are here rather than in the client because a student with no sign-in can do
 * nothing at all: adding one is not two steps that may half-succeed. If the username is taken, the
 * half-made student is removed and the form stays open on what the parent typed.
 *
 * The redirect is issued **from the server**, on the same response that revalidates `/account` and
 * `/dashboard`. A client-side `router.push` after the action had to wait for a second round trip
 * before the browser moved at all, which read as nothing happening — long enough that a buyer
 * would reload `/account` and land back where they started.
 *
 * Returns only on failure: a successful call redirects, so nothing after `await` runs in the
 * caller.
 */
export async function addStudent(input: {
  profile: ProfileInput;
  username: string;
  password: string;
}): Promise<{ ok: false; message: string }> {
  const created = await createProfile(input.profile);
  if (!created.ok) return { ok: false, message: created.message };

  const credentials = await setStudentCredentials({
    profileId: created.profile.id,
    username: input.username,
    password: input.password,
  });
  if (!credentials.ok) {
    await deleteStudent(created.profile.id);
    return { ok: false, message: credentials.message };
  }

  // A new student's next step is claiming their first session, which lives on the dashboard.
  redirect("/dashboard");
}
