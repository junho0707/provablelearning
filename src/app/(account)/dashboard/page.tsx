import Link from "next/link";
import { redirect } from "next/navigation";
import { listProfiles } from "@/lib/accounts/profiles";
import { getBalance } from "@/lib/credits/balance";
import { currentBuyerId } from "@/lib/auth/session";
import { listFirstSessionEligible, listUnusedFirstSessions } from "@/lib/assessment/first-session";
import { getMyBookings } from "@/lib/booking/history";
import { labelFor } from "@/lib/accounts/purposes";
import { PurchaseNotice } from "@/components/purchase-notice";
import { purchaseReturn } from "@/lib/billing/purchase-return";
import { viewerTimeZone } from "@/lib/booking/viewer-timezone";
import { sessionTime } from "@/lib/time-format";
import { PRICING, formatPrice } from "@/lib/pricing";
import { BTN, BTN_LG, BTN_SECONDARY, EYEBROW, H1, NOTICE, NOTICE_GOLD } from "@/lib/ui";

export const metadata = { title: "Dashboard" };

/**
 * The buyer's hub (`system/05-SURFACES.md` §2). F2 requires a specific empty state: an account with
 * no students shows one prompt and nothing else, because every other surface — booking, the First
 * Session promo, credits — is meaningless until there is someone to book for.
 *
 * Students are a hairline-divided list, not a stack of cards: the landing's grids separate their
 * cells with a rule and never with a gap, and a gapped row here read as a card floating on the
 * same ground the panels use.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login?next=/dashboard");

  // Stripe redirects here the instant the card clears, which is a second or two before the webhook
  // that records the purchase and books the session. Saying "processing" is the honest reading of
  // that gap; showing the old balance would be a wrong answer to the only question the buyer has
  // (`03-FLOWS.md` F3, failure paths).
  const { paid, sessionId } = purchaseReturn((await searchParams).purchase);
  const timeZone = await viewerTimeZone();

  const [profiles, balance, unusedFirstSessions, eligibleFirstSessions, bookings] =
    await Promise.all([
      listProfiles(),
      getBalance(),
      listUnusedFirstSessions(),
      listFirstSessionEligible(),
      getMyBookings(),
    ]);

  // Upcoming sessions belong to a student, not to the account, so they are listed under the
  // student they were booked for rather than in one pile a parent of two would have to read names
  // off. `getMyBookings` returns newest first for the history list on `/sessions`; soonest-first is
  // what a "what's next" block wants.
  const now = Date.now();
  const upcomingByStudent = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    if (booking.status !== "booked") continue;
    if (new Date(booking.startsAt).getTime() <= now) continue;
    const forStudent = upcomingByStudent.get(booking.profileId) ?? [];
    forStudent.push(booking);
    upcomingByStudent.set(booking.profileId, forStudent);
  }
  for (const list of upcomingByStudent.values()) {
    list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  // A First Session grants no credit — it is an entitlement against one student (INV-FIRST-1), so
  // the wallet stays at zero and a buyer who has paid would otherwise read "0 credits" as nothing.
  // Bought-and-unused, never "eligible to buy": handing the latter a free booking gives it away.
  const prepaid = new Set(unusedFirstSessions);

  // The opposite set: students who have not bought their First Session yet. A buyer with no credits
  // and no entitlement has nothing to act on otherwise — the row would offer "Book a session" and
  // the booking form would then turn them away for having no credit. The two sets never overlap
  // (`listFirstSessionEligible` excludes anyone who has bought one), so a row shows one or neither.
  const claimable = new Set(eligibleFirstSessions.map((s) => s.profileId));
  const firstSessionPrice = formatPrice(PRICING.first_session.priceCents);

  /**
   * What a student's row is actually asking the buyer to do. Exactly one of these is true at a
   * time, and the row leads with it: the First Session is still on offer, it is paid for and
   * waiting to be booked, it is spent and the wallet is empty, or there are credits to spend.
   * "Book a session" alone was a dead end for the first two and the third — the booking form
   * turns away anyone without a credit, and nothing said where to get one.
   */
  function rowState(profileId: string) {
    if (claimable.has(profileId)) return "claim";
    if (prepaid.has(profileId)) return "prepaid";
    return balance === 0 ? "needs-credits" : "ready";
  }

  if (profiles.length === 0) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-24 text-center sm:px-10">
        <h1 className={H1}>Let&apos;s add who&apos;s learning</h1>
        <p className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-navy-700">
          Add a student to get started. You can add more than one, and each gets their own first
          session at {formatPrice(PRICING.first_session.priceCents)}.
        </p>
        <Link href="/account" className={`mt-10 ${BTN_LG}`}>
          Add a student
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-6 py-16 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={H1}>Dashboard</h1>
        <p className="text-[0.9375rem] text-navy-700">
          <strong className="font-semibold tabular-nums text-navy-950">{balance}</strong> credit
          {balance === 1 ? "" : "s"} ·{" "}
          <Link href="/credits" className="font-semibold text-navy-950 underline">
            Buy more
          </Link>
        </p>
      </div>

      {paid && (
        <PurchaseNotice sessionId={sessionId}>
          <p className={`mt-8 ${NOTICE_GOLD}`}>
            <strong className="font-semibold text-navy-950">Payment received</strong> — setting up
            your session. It appears below within a few seconds.
          </p>
        </PurchaseNotice>
      )}

      <div className="mt-10 border-t border-navy-950/10">
        {profiles.map((profile) => (
          <div key={profile.id} className="border-b border-navy-950/10 py-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold tracking-[-0.01em] text-navy-950">
                  {profile.name}
                </p>
                <p className="mt-1 text-[0.875rem] text-navy-700">
                  {[profile.grade, profile.currentMathClass].filter(Boolean).join(" · ") ||
                    "No class set"}
                </p>
                {profile.primaryPurpose && (
                  <p className="mt-0.5 text-[0.875rem] text-navy-950/45">
                    {labelFor(profile.primaryPurpose)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {rowState(profile.id) === "claim" && (
                  // To `/credits`, not straight to `/first-session`: the offer sits there beside
                  // the bundles, so a buyer who decides the discounted hour isn't what they want
                  // can buy credits without walking back out of a checkout.
                  <Link href="/credits" className={BTN}>
                    Claim first session · {firstSessionPrice}
                  </Link>
                )}
                {rowState(profile.id) === "needs-credits" && (
                  <Link href="/credits" className={BTN}>
                    Buy credits
                  </Link>
                )}
                <Link
                  href={`/book?student=${profile.id}`}
                  className={rowState(profile.id) === "ready" ? BTN : BTN_SECONDARY}
                >
                  Book a session
                </Link>
              </div>
            </div>

            {(upcomingByStudent.get(profile.id) ?? []).length > 0 && (
              <div className="mt-5 border-t border-navy-950/10">
                {(upcomingByStudent.get(profile.id) ?? []).map((booking) => (
                  <div key={booking.id} className="border-b border-navy-950/10 py-3 last:border-b-0">
                    <p className={EYEBROW}>Coming up</p>
                    <p className="mt-1.5 text-[0.9375rem] font-semibold text-navy-950">
                      {sessionTime(booking.startsAt, timeZone)}
                    </p>
                    <p className="mt-0.5 text-[0.875rem] text-navy-700">
                      60 minutes
                      {booking.purpose ? ` \u00b7 ${labelFor(booking.purpose)}` : ""}
                      {" \u00b7 "}
                      {profile.name} joins from their own sign-in.
                    </p>
                  </div>
                ))}
              </div>
            )}

            {prepaid.has(profile.id) && (
              <p className={`mt-5 ${NOTICE_GOLD}`}>
                <strong className="font-semibold text-navy-950">First session paid</strong> —{" "}
                {profile.name} has one session ready to book. It costs no credit.
              </p>
            )}

            {rowState(profile.id) === "claim" && (
              <p className={`mt-5 ${NOTICE_GOLD}`}>
                <strong className="font-semibold text-navy-950">
                  Claim {profile.name}&apos;s first session — {firstSessionPrice}
                </strong>{" "}
                instead of {formatPrice(PRICING.credits_1.priceCents)}. One per student, and it
                takes no credits.
              </p>
            )}

            {!profile.hasLogin && (
              <p className={`mt-5 ${NOTICE}`}>
                {profile.name} doesn&apos;t have a sign-in yet — they&apos;ll need one to do session
                prep and see their materials.{" "}
                <Link href="/account" className="font-semibold text-navy-950 underline">
                  Set one up
                </Link>
              </p>
            )}
          </div>
        ))}
      </div>

      <Link
        href="/account"
        className="mt-6 inline-block text-[0.875rem] font-semibold text-navy-600 hover:text-navy-950"
      >
        + Add another student
      </Link>
    </main>
  );
}
