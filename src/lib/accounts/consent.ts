"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deactivateStudentLogin } from "./student-credentials";

/**
 * Parental consent controls (F13, `system/06-AUTH-AND-COPPA.md` §4 items 4 and 7).
 *
 * These three actions — review, revoke, delete — are the parent-facing half of the COPPA stack and
 * the only part of it that is code rather than published text. Everything here is initiated by the
 * buyer and scoped to their own students.
 */

export type ConsentState = {
  granted: boolean;
  grantedAt: string | null;
  /** Every recorded grant and revocation, newest first — this is the "review" in review/delete/revoke. */
  events: Array<{ event: string; mechanism: string; at: string; profileId: string | null }>;
};

export async function getConsentState(): Promise<ConsentState> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("consent_events")
    .select("event, mechanism, at, profile_id")
    .order("at", { ascending: false });

  const events = (data ?? []).map((row) => ({
    event: row.event as string,
    mechanism: row.mechanism as string,
    at: row.at as string,
    profileId: (row.profile_id as string | null) ?? null,
  }));

  const grant = events.filter((e) => e.event === "granted").at(-1) ?? null;
  return { granted: Boolean(grant), grantedAt: grant?.at ?? null, events };
}

/**
 * Everything held about one student, for the parent to inspect. Deliberately assembled from the
 * live tables rather than a stored summary — a review surface that can drift from the data it
 * describes is worse than none.
 */
export async function reviewStudentData(profileId: string): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("learner_profiles")
    .select("id, name, grade, current_math_class, previous_math_class, primary_purpose, secondary_purpose, username, login_active, created_at")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;

  const { count: sessionCount } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  return {
    profile,
    sessions: sessionCount ?? 0,
    note: "Session preparation, uploaded files, assessment answers and progress are held for as long as this student is active, and deleted within 30 days of deletion or consent being withdrawn.",
  };
}

export type ConsentActionResult = { ok: true } | { ok: false; message: string };

/**
 * Withdraw consent for one student. Deactivates the login and stops further collection **without
 * deleting anything** — a parent who wants the data gone asks for that separately, and conflating
 * the two would destroy records a parent may have only meant to pause.
 */
export async function revokeConsentForStudent(profileId: string): Promise<ConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in required." };

  const { data: profile } = await supabase
    .from("learner_profiles")
    .select("id, auth_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return { ok: false, message: "Student not found." };

  const { error } = await supabase.rpc("revoke_consent", { p_profile_id: profileId });
  if (error) return { ok: false, message: "Could not withdraw consent." };

  // The database flag denies access on its own; the auth-level ban stops a session being minted at
  // all. Both, because one is the boundary and the other is the door.
  if (profile.auth_user_id) await deactivateStudentLogin(profile.auth_user_id as string);
  return { ok: true };
}

/**
 * Delete a student and everything collected from them (AT-COPPA-5). Cascades handle the child rows;
 * this removes the two things a cascade cannot reach — the auth user, and the stored files.
 */
export async function deleteStudent(profileId: string): Promise<ConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in required." };

  const { data: profile } = await supabase
    .from("learner_profiles")
    .select("id, account_id, auth_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile || profile.account_id !== user.id) return { ok: false, message: "Student not found." };

  const admin = createAdminClient();

  // Uploaded files live in storage, which no foreign key reaches. Remove them first: an orphaned
  // object that outlives its database row is exactly the retention failure this action exists to
  // prevent (`system/06-AUTH-AND-COPPA.md` §5).
  await deleteStudentUploads(profileId);

  const { error } = await supabase.from("learner_profiles").delete().eq("id", profileId);
  if (error) return { ok: false, message: "Could not delete that student." };

  if (profile.auth_user_id) {
    await admin.auth.admin.deleteUser(profile.auth_user_id as string);
  }
  return { ok: true };
}

/**
 * Remove every stored file belonging to a student. Uploads are keyed by profile id (see R4), so a
 * prefix listing is exhaustive; a missing bucket is not an error, it just means nothing was ever
 * uploaded.
 */
async function deleteStudentUploads(profileId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: files } = await admin.storage.from("session-uploads").list(profileId);
  if (!files?.length) return;
  await admin.storage.from("session-uploads").remove(files.map((f) => `${profileId}/${f.name}`));
}
