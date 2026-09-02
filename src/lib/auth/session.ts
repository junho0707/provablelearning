import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Who is signed in. Two kinds of principal share one auth system (`system/01-ACTORS.md`), and
 * almost every page needs to know which one it is looking at.
 *
 * The distinction is not cosmetic: a student has **no `accounts` row** (migration 0017), so every
 * buyer-scoped RLS policy already denies them. These helpers make that boundary explicit at the
 * routing layer too, so a student who lands on a buyer URL gets a sensible redirect instead of an
 * empty page rendered from denied queries.
 */

export type StudentSession = {
  authUserId: string;
  profileId: string;
  name: string;
  currentMathClass: string | null;
  previousMathClass: string | null;
};

/** The signed-in student, or null when nobody is signed in or the session belongs to a buyer. */
export async function currentStudent(): Promise<StudentSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Scoped by `learner_profiles_select_self`, which additionally requires `login_active` — a
  // student whose consent was withdrawn has a valid session and still resolves to null here.
  const { data } = await supabase
    .from("learner_profiles")
    .select("id, name, current_math_class, previous_math_class")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    authUserId: user.id,
    profileId: data.id as string,
    name: data.name as string,
    currentMathClass: (data.current_math_class as string | null) ?? null,
    previousMathClass: (data.previous_math_class as string | null) ?? null,
  };
}

export async function requireStudent(): Promise<StudentSession> {
  const student = await currentStudent();
  if (!student) redirect("/student/login");
  return student;
}

/** The signed-in buyer's account id, or null for a signed-out visitor or a student session. */
export async function currentBuyerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("accounts").select("id").eq("id", user.id).maybeSingle();
  return data ? (data.id as string) : null;
}

export async function requireBuyer(): Promise<string> {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login");
  return buyerId;
}
