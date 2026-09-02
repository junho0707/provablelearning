"use server";

import { createClient } from "@/lib/supabase/server";
import {
  profileInputSchema,
  validCourseNode,
  type LearnerProfile,
  type ProfileInput,
  type ProfileResult,
} from "./types";

/**
 * Student CRUD, scoped to the signed-in buyer. RLS (migrations 0003 + 0017) is the actual access
 * boundary — every query below runs through the cookie-bound client, so a cross-account read or
 * write is denied by Postgres rather than by application logic (AT-ACTOR-3).
 *
 * Credentials are deliberately *not* handled here: they need the service role, and keeping them in
 * `student-credentials.ts` means this module never touches an admin client.
 */

const COLUMNS =
  "id, name, grade, current_course_node, current_math_class, previous_math_class, primary_purpose, secondary_purpose, username, login_active, auth_user_id, created_at";

type ProfileRow = {
  id: string;
  name: string;
  grade: string | null;
  current_course_node: string | null;
  current_math_class: string | null;
  previous_math_class: string | null;
  primary_purpose: string | null;
  secondary_purpose: string | null;
  username: string | null;
  login_active: boolean;
  auth_user_id: string | null;
  created_at: string;
};

function toProfile(row: ProfileRow): LearnerProfile {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    currentCourseNode: row.current_course_node,
    currentMathClass: row.current_math_class,
    previousMathClass: row.previous_math_class,
    primaryPurpose: row.primary_purpose,
    secondaryPurpose: row.secondary_purpose,
    username: row.username,
    loginActive: row.login_active,
    hasLogin: row.auth_user_id !== null,
    createdAt: row.created_at,
  };
}

export async function listProfiles(): Promise<LearnerProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learner_profiles")
    .select(COLUMNS)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as ProfileRow[]).map(toProfile);
}

export async function getProfile(profileId: string): Promise<LearnerProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("learner_profiles").select(COLUMNS).eq("id", profileId).maybeSingle();
  return data ? toProfile(data as ProfileRow) : null;
}

function toPatch(input: Partial<ProfileInput>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.grade !== undefined) patch.grade = input.grade;
  if (input.currentCourseNode !== undefined) patch.current_course_node = input.currentCourseNode;
  if (input.currentMathClass !== undefined) patch.current_math_class = input.currentMathClass;
  if (input.previousMathClass !== undefined) patch.previous_math_class = input.previousMathClass;
  if (input.primaryPurpose !== undefined) patch.primary_purpose = input.primaryPurpose;
  if (input.secondaryPurpose !== undefined) patch.secondary_purpose = input.secondaryPurpose;
  return patch;
}

export async function createProfile(input: ProfileInput): Promise<ProfileResult> {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "malformed", message: parsed.error.issues[0]?.message ?? "Invalid student." };
  }
  if (!validCourseNode(parsed.data.currentCourseNode)) {
    return { ok: false, code: "malformed", message: "Unknown current class." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  const { data, error } = await supabase
    .from("learner_profiles")
    .insert({ account_id: user.id, ...toPatch(parsed.data) })
    .select(COLUMNS)
    .single();

  if (error || !data) return { ok: false, code: "denied", message: "Could not add that student." };
  return { ok: true, profile: toProfile(data as ProfileRow) };
}

export async function updateProfile(
  profileId: string,
  input: Partial<ProfileInput>,
): Promise<ProfileResult> {
  const parsed = profileInputSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "malformed", message: parsed.error.issues[0]?.message ?? "Invalid student." };
  }
  if (!validCourseNode(parsed.data.currentCourseNode)) {
    return { ok: false, code: "malformed", message: "Unknown current class." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learner_profiles")
    .update(toPatch(parsed.data))
    .eq("id", profileId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, code: "denied", message: "Could not update that student." };
  if (!data) return { ok: false, code: "not_found", message: "Student not found." };
  return { ok: true, profile: toProfile(data as ProfileRow) };
}
