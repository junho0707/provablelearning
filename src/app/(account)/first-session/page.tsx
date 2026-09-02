import Link from "next/link";
import { redirect } from "next/navigation";
import { currentBuyerId } from "@/lib/auth/session";
import { listFirstSessionEligible } from "@/lib/assessment/first-session";
import { listProfiles } from "@/lib/accounts/profiles";
import { PRICING, formatPrice } from "@/lib/pricing";

export const metadata = { title: "First session" };

/**
 * Buying a First Session (F4). This used to be a multi-step "flow" that routed a purchased session
 * to its assessment; ADR-007 moved preparation into the student's own account and booking into
 * `/book`, so all that remains here is the purchase itself.
 */
export default async function FirstSessionPage() {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login?next=/first-session");

  const [eligible, profiles] = await Promise.all([listFirstSessionEligible(), listProfiles()]);
  const price = formatPrice(PRICING.first_session.priceCents);
  const { FirstSessionPurchase } = await import("./first-session-purchase");

  if (profiles.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-950">First session</h1>
        <p className="mt-3 text-navy-700">Add a student first — the offer is theirs, one each.</p>
        <Link
          href="/account"
          className="mt-6 inline-block rounded-lg bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-800"
        >
          Add a student
        </Link>
      </main>
    );
  }

  if (eligible.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-950">First session</h1>
        <p className="mt-3 text-navy-700">
          Every student on your account has already used their first session. Credit packs are what
          come next.
        </p>
        <Link
          href="/credits"
          className="mt-6 inline-block rounded-lg bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-800"
        >
          See credit packs
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-2xl font-extrabold tracking-tight text-navy-950">First session — {price}</h1>
      <p className="mb-8 mt-2 text-navy-700">
        One per student, instead of {formatPrice(PRICING.credits_1.priceCents)}. Tell us what
        you&apos;re after and we&apos;ll shape the hour around it.
      </p>
      <FirstSessionPurchase eligible={eligible} price={price} />
    </main>
  );
}
