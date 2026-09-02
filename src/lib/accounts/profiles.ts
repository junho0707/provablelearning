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
 * TASK-ACCT-001: profile CRUD, scoped to the signed-in buyer. RLS (migration 0003) is the actual
 * access boundary — every query below runs through the cookie-bound client, so a cross-account
 * read/write is denied by Postgres, not by application logic (AT-SEC-001).
 */

type ProfileRow = {
  id: string;
  name: string;
  grade: string | null;
  current_course_node: string | null;
  purposes: string[] | null;
  created_at: string;
};

function toProfile(row: ProfileRow): LearnerProfile {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    currentCourseNode: row.current_course_node,
    purposes: (row.purposes ?? []) as LearnerProfile["purposes"],
    createdAt: row.created_at,
  };
}

export async function listProfiles(): Promise<LearnerProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learner_profiles")
    .select("id, name, grade, current_course_node, purposes, created_at")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as ProfileRow[]).map(toProfile);
}

export async function createProfile(input: ProfileInput): Promise<ProfileResult> {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Invalid profile." };
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
    .insert({
      account_id: user.id,
      name: parsed.data.name,
      grade: parsed.data.grade ?? null,
      current_course_node: parsed.data.currentCourseNode ?? null,
      purposes: parsed.data.purposes ?? [],
    })
    .select("id, name, grade, current_course_node, purposes, created_at")
    .single();

  if (error || !data) return { ok: false, code: "denied", message: "Could not create profile." };
  return { ok: true, profile: toProfile(data as ProfileRow) };
}

export async function updateProfile(
  profileId: string,
  input: Partial<ProfileInput>,
): Promise<ProfileResult> {
  const parsed = profileInputSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Invalid profile." };
  if (!validCourseNode(parsed.data.currentCourseNode)) {
    return { ok: false, code: "malformed", message: "Unknown current class." };
  }

  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.grade !== undefined) patch.grade = parsed.data.grade;
  if (parsed.data.currentCourseNode !== undefined) patch.current_course_node = parsed.data.currentCourseNode;
  if (parsed.data.purposes !== undefined) patch.purposes = parsed.data.purposes;

  const { data, error } = await supabase
    .from("learner_profiles")
    .update(patch)
    .eq("id", profileId)
    .select("id, name, grade, current_course_node, purposes, created_at")
    .maybeSingle();

  if (error) return { ok: false, code: "denied", message: "Could not update profile." };
  if (!data) return { ok: false, code: "not_found", message: "Profile not found." };
  return { ok: true, profile: toProfile(data as ProfileRow) };
}

export async function deleteProfile(profileId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("learner_profiles")
    .delete({ count: "exact" })
    .eq("id", profileId);
  return { ok: !error && (count ?? 0) > 0 };
}
