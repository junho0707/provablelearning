import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/session";
import { getBalance } from "@/lib/credits/balance";
import { getPurchaseHistory, getLedgerHistory } from "@/lib/credits/history";
import { listFirstSessionEligible } from "@/lib/assessment/first-session";
import { PRICING, formatPrice, perCreditCents, savingPercent } from "@/lib/pricing";
import { BuyCredits } from "./buy-credits";
import { OrderHistory } from "./order-history";
import { PurchaseNotice } from "@/components/purchase-notice";
import { purchaseReturn } from "@/lib/billing/purchase-return";
import { EYEBROW, H1, H2, NOTICE_GOLD } from "@/lib/ui";

export const metadata = { title: "Credits" };

const INFO_ITEMS = [
  "Credits never expire",
  "Each session uses one credit",
  "The first session is a separate, one-time purchase — one per student",
];

/**
 * TASK-BILLING-002. Kept apart from `/sessions` on purpose: every action here leaves for Stripe, so
 * it must not sit inside the booking flow where a stray click would abandon a half-picked slot.
 *
 * The balance is set in the landing's price size and the rules beside it are cells of the same
 * hairline grid the landing uses — this page and the pricing panel say the same things, and should
 * not say them in two different voices.
 */
export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  // Stripe redirects back the instant the card clears, a second or two ahead of the webhook that
  // grants the credits. Say the purchase is processing rather than render a balance that is about
  // to be wrong (`03-FLOWS.md` F3, failure paths).
  const { paid, sessionId } = purchaseReturn((await searchParams).purchase);
  const { user } = await getAuthUser();
  if (!user) redirect("/login?next=/credits");

  const [balance, purchases, ledger, firstSessionEligible] = await Promise.all([
    getBalance(),
    getPurchaseHistory(),
    getLedgerHistory(),
    listFirstSessionEligible(),
  ]);

  return (
    <main className="mx-auto max-w-[1200px] px-6 py-16 sm:px-10">
      <h1 className={H1}>Credits</h1>

      {paid && (
        <PurchaseNotice sessionId={sessionId}>
          <p className={`mt-8 ${NOTICE_GOLD}`}>
            <strong className="font-semibold text-navy-950">Payment received</strong> — your credits
            land within a few seconds.
          </p>
        </PurchaseNotice>
      )}

      <div className="mt-10 grid border-y border-navy-950/10 sm:grid-cols-4">
        <div className="border-b border-navy-950/10 py-6 sm:border-b-0 sm:border-r sm:border-navy-950/10 sm:py-10 sm:pr-8">
          <p className={EYEBROW}>Balance</p>
          <p className="mt-4 text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums text-navy-950">
            {balance}
          </p>
          <p className="mt-2 text-[0.9375rem] text-navy-700">
            {balance === 1 ? "credit" : "credits"}
          </p>
        </div>
        {INFO_ITEMS.map((item) => (
          <div
            key={item}
            className="border-b border-navy-950/10 py-6 last:border-b-0 sm:border-b-0 sm:border-r sm:px-8 sm:py-10 sm:last:border-r-0 sm:last:pr-0"
          >
            <p className="text-[0.9375rem] leading-relaxed text-navy-700">{item}</p>
          </div>
        ))}
      </div>

      <section className="mt-12">
        <h2 className={`mb-8 ${H2}`}>Buy more</h2>
        <BuyCredits
          firstSessionEligible={firstSessionEligible}
          firstSessionPrice={formatPrice(PRICING.first_session.priceCents)}
          bundles={(["credits_1", "credits_2", "credits_4", "credits_8"] as const).map((sku) => ({
            sku,
            label: `${PRICING[sku].credits} credit${PRICING[sku].credits === 1 ? "" : "s"}`,
            price: formatPrice(PRICING[sku].priceCents),
            perCredit: formatPrice(perCreditCents(sku)),
            saving: savingPercent(sku),
          }))}
        />
      </section>

      <section className="mt-12 border-t border-navy-950/10 pt-10">
        <h2 className={`mb-8 ${H2}`}>History</h2>
        <OrderHistory purchases={purchases} ledger={ledger} />
      </section>
    </main>
  );
}
