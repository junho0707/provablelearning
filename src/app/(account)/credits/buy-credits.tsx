"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createCreditsCheckout } from "@/lib/billing/checkout";
import type { SkuId } from "@/lib/pricing";

const packButtonClass =
  "w-full rounded-lg border border-navy-200 px-4 py-2.5 text-left text-sm font-semibold text-navy-900 transition hover:border-navy-400 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Credit-pack purchase, plus the second entry point to the First Session offer that F4 requires —
 * a buyer who came here to top up should still see an unclaimed first session going spare.
 *
 * The offer itself lives on `/first-session`, because choosing a student and a purpose is a real
 * step rather than a dropdown, and both entry points must reach the same checkout.
 */
export function BuyCredits({
  firstSessionEligible,
  firstSessionPrice,
  creditPacks,
}: {
  firstSessionEligible: Array<{ profileId: string; name: string }>;
  firstSessionPrice: string;
  creditPacks: { sku: SkuId; label: string; price: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buyCredits(sku: SkuId) {
    setError(null);
    startTransition(async () => {
      const result = await createCreditsCheckout({ sku });
      if (!result.ok) return setError(result.message);
      window.location.href = result.checkoutUrl;
    });
  }

  return (
    <div>
      {firstSessionEligible.length > 0 && (
        <div className="mb-6 rounded-lg border border-gold-300 bg-gold-50 p-4">
          <p className="text-sm font-bold text-navy-950">
            First session available — {firstSessionPrice}
          </p>
          <p className="mt-1 text-sm text-navy-700">
            {firstSessionEligible.length === 1
              ? `${firstSessionEligible[0].name} hasn't used theirs yet.`
              : `${firstSessionEligible.length} students haven't used theirs yet.`}{" "}
            One per student.
          </p>
          <Link
            href="/first-session"
            className="mt-3 inline-block rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
          >
            Claim it
          </Link>
        </div>
      )}

      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-navy-400">
        Credit packs
      </p>
      {error && <p className="mb-3 text-sm font-semibold text-[var(--error)]">{error}</p>}

      <div className="space-y-2">
        {creditPacks.map((pack) => (
          <button
            key={pack.sku}
            className={packButtonClass}
            disabled={pending}
            onClick={() => buyCredits(pack.sku)}
          >
            {pack.label} — {pack.price}
          </button>
        ))}
      </div>
    </div>
  );
}
