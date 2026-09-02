import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/credits/balance";
import { getPurchaseHistory, getLedgerHistory } from "@/lib/credits/history";
import { listProfiles } from "@/lib/accounts/profiles";
import { PRICING, formatPrice } from "@/lib/pricing";
import { BuyCredits } from "./buy-credits";
import { OrderHistory } from "./order-history";

export const metadata = { title: "Credits" };

const INFO_ITEMS = [
  "Credits never expire",
  "Each session uses one credit",
  "The first session is a separate, one-time purchase",
];

/**
 * TASK-BILLING-002. Kept apart from `/sessions` on purpose: every action here leaves for Stripe, so
 * it must not sit inside the booking flow where a stray click would abandon a half-picked slot.
 */
export default async function CreditsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/credits");

  const [balance, purchases, ledger, profiles] = await Promise.all([
    getBalance(),
    getPurchaseHistory(),
    getLedgerHistory(),
    listProfiles(),
  ]);
  const hasFirstSession = purchases.some((p) => p.sku === "first_session");

  return (
    <main>
      <section className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
        <h1 className="mb-3 text-3xl font-extrabold tracking-[-0.01em] text-navy-950 sm:text-4xl">
          Credits
        </h1>
        <p className="mb-8 text-lg text-navy-600">Buy the sessions you&apos;ll book.</p>

        <ul className="mb-10 flex flex-wrap gap-2">
          {INFO_ITEMS.map((item) => (
            <li
              key={item}
              className="rounded-full border border-navy-100 bg-white px-3 py-1 text-xs font-medium text-navy-600"
            >
              {item}
            </li>
          ))}
        </ul>

        <div className="mb-12 grid gap-8 lg:grid-cols-[320px_1fr] lg:items-start">
          <div className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]">
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-400">Balance</p>
            <p className="mt-1 text-3xl font-extrabold text-navy-950">
              {balance} {balance === 1 ? "credit" : "credits"}
            </p>
          </div>

          <div className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]">
            <BuyCredits
              hasFirstSession={hasFirstSession}
              firstSessionPrice={formatPrice(PRICING.first_session.priceCents)}
              profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
              creditPacks={[
                { sku: "credits_1", label: "1 credit", price: formatPrice(PRICING.credits_1.priceCents) },
                { sku: "credits_2", label: "2 credits", price: formatPrice(PRICING.credits_2.priceCents) },
                { sku: "credits_4", label: "4 credits", price: formatPrice(PRICING.credits_4.priceCents) },
                { sku: "credits_8", label: "8 credits", price: formatPrice(PRICING.credits_8.priceCents) },
              ]}
            />
          </div>
        </div>

        <div className="border-t border-navy-100 pt-10">
          <h2 className="mb-6 text-lg font-bold text-navy-950">History</h2>
          <OrderHistory purchases={purchases} ledger={ledger} />
        </div>
      </section>
    </main>
  );
}
