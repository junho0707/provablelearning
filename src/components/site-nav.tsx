import { getAuthUser, getBuyerAccountId } from "@/lib/auth/session";
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
  const { user } = await getAuthUser();
  const accountId = user ? await getBuyerAccountId() : null;
  const isStudent = Boolean(user) && !accountId;

  return <SiteNavClient email={accountId ? (user?.email ?? null) : null} isStudent={isStudent} />;
}
