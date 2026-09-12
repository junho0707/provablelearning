import { cache } from "react";
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

// `auth.getUser()` revalidates the JWT against Supabase's Auth server on every call — it's a
// network round trip, not a local decode. `SiteNav` and the page it wraps both need to know who's
// signed in, so without this they each paid that round trip on every navigation. `cache()` scopes
// the memoization to a single request, which is exactly the span layout + page render span.
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

// Same duplication, one level down: `SiteNav` and `currentBuyerId` both look up the buyer's
// `accounts` row for the same user.
export const getBuyerAccountId = cache(async (): Promise<string | null> => {
  const { supabase, user } = await getAuthUser();
  if (!user) return null;
  const { data } = await supabase.from("accounts").select("id").eq("id", user.id).maybeSingle();
  return data ? (data.id as string) : null;
});

export type StudentSession = {
  authUserId: string;
  profileId: string;
  name: string;
  currentMathClass: string | null;
  previousMathClass: string | null;
};

/** The signed-in student, or null when nobody is signed in or the session belongs to a buyer. */
export async function currentStudent(): Promise<StudentSession | null> {
  const { supabase, user } = await getAuthUser();
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
  return getBuyerAccountId();
}

export async function requireBuyer(): Promise<string> {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login");
  return buyerId;
}
