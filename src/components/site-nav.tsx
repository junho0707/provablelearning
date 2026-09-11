import { createClient } from "@/lib/supabase/server";
import { SiteNavClient } from "@/components/site-nav-client";

/**
 * Top navigation shared across public and account pages.
 *
 * **Signed in is not the same as buyer.** A student is an ordinary auth user carrying a synthetic
 * `.invalid` address (migration 0017), so keying this on `user.email` showed a student the buyer's
 * tabs — Credits, Messages, Account — on every page that renders this header. The pages themselves
 * refuse them (`currentBuyerId`), so nothing leaked; what they got was a row of locked doors.
 *
 * The `accounts` row is the actor boundary everywhere else (`INV-ACTOR-1`), so it is what the nav
 * asks about too.
 */
export async function SiteNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: account } = user
    ? await supabase.from("accounts").select("id").eq("id", user.id).maybeSingle()
    : { data: null };
  const isStudent = Boolean(user) && !account;

  return <SiteNavClient email={account ? (user?.email ?? null) : null} isStudent={isStudent} />;
}
