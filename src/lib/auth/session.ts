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

/** Who the access token says is signed in. Only the two fields any caller reads. */
export type AuthUser = { id: string; email: string | null };

// `getClaims()` verifies the access token's signature locally with WebCrypto, against the project's
// published JWKS (ES256). `getUser()`, which this used to call, instead asks Supabase Auth to
// revalidate the token — a blocking network round trip, measured at 240-545ms, in front of every
// authed page render. The JWKS is cached in a module-global inside auth-js, so it is fetched once
// per server process rather than once per request, and the verification itself is local.
//
// The tradeoff: a signature is proof the token was issued, not proof it is still wanted. A session
// revoked mid-life (sign-out elsewhere, a ban) stays accepted here until the token expires. RLS is
// unaffected — it re-checks the JWT on every query — so what a stale token buys is the page shell,
// not anybody's data. The proxy already made the same trade for the refresh (8d526f1).
//
// `cache()` still scopes the result to one request: `SiteNav` and the page it wraps both ask.
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const user: AuthUser | null = claims?.sub
    ? { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
    : null;
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
