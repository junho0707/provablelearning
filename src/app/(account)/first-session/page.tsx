import Link from "next/link";
import { redirect } from "next/navigation";
import { currentBuyerId } from "@/lib/auth/session";
import { listFirstSessionEligible } from "@/lib/assessment/first-session";
import { listProfiles } from "@/lib/accounts/profiles";
import { getOpenAvailability } from "@/lib/booking/availability";
import { PRICING, formatPrice } from "@/lib/pricing";
import { BTN_LG, EYEBROW, H1 } from "@/lib/ui";

export const metadata = { title: "First session" };

/**
 * Buying a First Session (F4). This used to be a multi-step "flow" that routed a purchased session
 * to its assessment; ADR-007 moved preparation into the student's own account and booking into
 * `/book`, so all that remains here is the purchase itself.
 */
export default async function FirstSessionPage() {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login?next=/first-session");

  const [eligible, profiles, slots] = await Promise.all([
    listFirstSessionEligible(),
    listProfiles(),
    getOpenAvailability(),
  ]);
  const price = formatPrice(PRICING.first_session.priceCents);
  const { FirstSessionPurchase } = await import("./first-session-purchase");

  if (profiles.length === 0) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24 text-center sm:px-10">
        <h1 className={H1}>First session</h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-navy-700">
          Add a student first — the offer is theirs, one each.
        </p>
        <Link href="/account" className={`mt-10 ${BTN_LG}`}>
          Add a student
        </Link>
      </main>
    );
  }

  if (eligible.length === 0) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24 text-center sm:px-10">
        <h1 className={H1}>First session</h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-navy-700">
          Every student on your account has already used their first session. Bundles are what come
          next.
        </p>
        <Link href="/credits" className={`mt-10 ${BTN_LG}`}>
          See bundles
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[560px] px-6 py-16 sm:px-10">
      <p className={EYEBROW}>One per student</p>
      {/* The price is set the way the landing sets a price — large, tight, tabular — so the offer
          looks like the same offer on both sides of the sign-in. */}
      <h1 className={`mt-5 ${H1}`}>
        First session <span className="tabular-nums">{price}</span>
      </h1>
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-navy-700">
        Instead of {formatPrice(PRICING.credits_1.priceCents)}. Tell us what you&apos;re after and
        we&apos;ll shape the hour around it.
      </p>
      <div className="mt-10 border-t border-navy-950/10 pt-10">
        <FirstSessionPurchase eligible={eligible} price={price} slots={slots} />
      </div>
    </main>
  );
}
