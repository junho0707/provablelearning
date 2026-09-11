"use server";

import { revalidateStudentSurfaces } from "./revalidate";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { credentialsInputSchema, usernameSchema, studentPasswordSchema } from "./types";
import { studentEmail } from "./student-identity";

/**
 * Student credentials (ADR-007 §2, `system/06-AUTH-AND-COPPA.md` §1).
 *
 * Buyers are passwordless; students are the single exception, because the design has to work for a
 * ten-year-old with no email inbox who cannot receive a magic link. Everything here therefore runs
 * through the service role — a student's auth user is created *for* them, never by them.
 *
 * Two properties this module is responsible for:
 *   - `INV-AUTH-1`: only the owning buyer may create or reset a student's credentials. Ownership is
 *     re-checked against the cookie-bound client on every call before the admin client is touched.
 *   - `INV-AUTH-2`: no email ever reaches a student. Their auth identity uses a synthetic address
 *     in the reserved `.invalid` TLD, which by RFC cannot resolve — so "we can never email a
 *     student" is a property of the address itself, not a rule someone has to remember.
 */

/** Long enough to be indefinite; Supabase has no "banned forever" literal. Lifted by `record_consent`. */
const BAN_UNTIL_CONSENT = "876000h";

export type CredentialResult =
  | { ok: true }
  | { ok: false; code: "denied" | "malformed" | "username_taken" | "not_found"; message: string };

/** Confirms the caller owns this profile. Returns the account id, or null when they do not. */
async function assertOwnership(profileId: string): Promise<{ accountId: string; authUserId: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS already scopes this to the caller's own profiles; the explicit account check is belt and
  // braces for a privileged path where a mistake is expensive.
  const { data } = await supabase
    .from("learner_profiles")
    .select("id, account_id, auth_user_id")
    .eq("id", profileId)
    .maybeSingle();

  if (!data || data.account_id !== user.id) return null;
  return { accountId: data.account_id, authUserId: data.auth_user_id };
}

/**
 * Give a student a login. Created **banned** unless the household has already consented, so the
 * credentials exist and can be handed over, but cannot be used until a payment records consent
 * (`system/06-AUTH-AND-COPPA.md` §3). That is the whole consent gate, in one flag.
 */
export async function setStudentCredentials(input: {
  profileId: string;
  username: string;
  password: string;
}): Promise<CredentialResult> {
  const parsed = credentialsInputSchema.safeParse({ username: input.username, password: input.password });
  if (!parsed.success) {
    return { ok: false, code: "malformed", message: parsed.error.issues[0]?.message ?? "Invalid credentials." };
  }

  const owned = await assertOwnership(input.profileId);
  if (!owned) return { ok: false, code: "denied", message: "That student isn't yours." };

  const admin = createAdminClient();

  // Already has a login: this is a username change plus a password reset, not a new user.
  if (owned.authUserId) {
    const { error } = await admin.auth.admin.updateUserById(owned.authUserId, {
      email: studentEmail(parsed.data.username),
      password: parsed.data.password,
    });
    if (error) return { ok: false, code: "username_taken", message: "That username is taken." };

    const { error: profileError } = await admin
      .from("learner_profiles")
      .update({ username: parsed.data.username })
      .eq("id", input.profileId);
    if (profileError) return { ok: false, code: "username_taken", message: "That username is taken." };
    return { ok: true };
  }

  const consented = await hasConsent(owned.accountId);

  const { data: created, error } = await admin.auth.admin.createUser({
    email: studentEmail(parsed.data.username),
    password: parsed.data.password,
    email_confirm: true, // No confirmation mail can ever be delivered to a .invalid address.
    user_metadata: { is_student: true, profile_id: input.profileId },
    ...(consented ? {} : { ban_duration: BAN_UNTIL_CONSENT }),
  });

  if (error || !created.user) {
    return { ok: false, code: "username_taken", message: "That username is taken." };
  }

  const { error: linkError } = await admin
    .from("learner_profiles")
    .update({
      auth_user_id: created.user.id,
      username: parsed.data.username,
      login_active: consented,
    })
    .eq("id", input.profileId);

  if (linkError) {
    // Never leave an orphan auth user behind — it would hold the username hostage.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, code: "username_taken", message: "That username is taken." };
  }

  revalidateStudentSurfaces();
  return { ok: true };
}

/** Password reset, by the buyer. There is no student-initiated path anywhere (INV-AUTH-1). */
export async function resetStudentPassword(input: {
  profileId: string;
  password: string;
}): Promise<CredentialResult> {
  const parsed = studentPasswordSchema.safeParse(input.password);
  if (!parsed.success) {
    return { ok: false, code: "malformed", message: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const owned = await assertOwnership(input.profileId);
  if (!owned) return { ok: false, code: "denied", message: "That student isn't yours." };
  if (!owned.authUserId) return { ok: false, code: "not_found", message: "That student has no login yet." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(owned.authUserId, { password: parsed.data });
  if (error) return { ok: false, code: "denied", message: "Could not reset that password." };
  return { ok: true };
}

/** Whether a username is free, for inline feedback before the form is submitted. */
export async function usernameAvailable(username: string): Promise<boolean> {
  if (!usernameSchema.safeParse(username).success) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("learner_profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  return !data;
}

async function hasConsent(accountId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("account_has_consent", { p_account_id: accountId });
  return data === true;
}

/**
 * Lift the auth-level ban on every student in a household. Called by the Stripe webhook after
 * `record_consent`, which sets the matching `login_active` flag the database policies read.
 *
 * Deliberately tolerant: a student whose unban fails is still recorded as consented in the
 * database, and the next call repairs them. A payment must never fail because of this.
 */
export async function activateStudentLogins(accountId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("learner_profiles")
    .select("auth_user_id")
    .eq("account_id", accountId)
    .not("auth_user_id", "is", null);

  for (const profile of profiles ?? []) {
    await admin.auth.admin.updateUserById(profile.auth_user_id as string, { ban_duration: "none" });
  }
}

/** Re-ban one student's login when their buyer revokes consent (F13). */
export async function deactivateStudentLogin(authUserId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(authUserId, { ban_duration: BAN_UNTIL_CONSENT });
}
