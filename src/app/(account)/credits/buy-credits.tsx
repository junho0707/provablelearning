"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createCreditsCheckout } from "@/lib/billing/checkout";
import type { SkuId } from "@/lib/pricing";
import { BTN, EYEBROW, NOTICE_ERROR } from "@/lib/ui";

/**
 * Bundle purchase, plus the second entry point to the First Session offer that F4 requires —
 * a buyer who came here to top up should still see an unclaimed first session going spare.
 *
 * The offer itself lives on `/first-session`, because choosing a student and a purpose is a real
 * step rather than a dropdown, and both entry points must reach the same checkout.
 *
 * A bundle is a cell of the landing's pricing grid, made clickable: price first, what it buys
 * beneath. Anyone who read the pricing panel before signing up is looking at the same object.
 */
export function BuyCredits({
  firstSessionEligible,
  firstSessionPrice,
  bundles,
}: {
  firstSessionEligible: Array<{ profileId: string; name: string }>;
  firstSessionPrice: string;
  bundles: { sku: SkuId; label: string; price: string; perCredit: string; saving: number }[];
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
        <div className="mb-8 border-l-2 border-gold-500 bg-gold-100 px-5 py-4">
          <p className="text-[0.9375rem] font-semibold text-navy-950">
            First session available — {firstSessionPrice}
          </p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-navy-800">
            {firstSessionEligible.length === 1
              ? `${firstSessionEligible[0].name} hasn't used theirs yet.`
              : `${firstSessionEligible.length} students haven't used theirs yet.`}{" "}
            One per student.
          </p>
          <Link href="/first-session" className={`mt-4 ${BTN}`}>
            Claim it
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className={`mb-6 ${NOTICE_ERROR}`}>
          {error}
        </p>
      )}

      <p className={`mb-1 ${EYEBROW}`}>Bundles — pick one to buy</p>
      <p className="mb-4 text-[0.9375rem] text-navy-700">
        The bigger the bundle, the less each session costs. Credits never expire.
      </p>
      <div className="grid border-y border-navy-950/10 sm:grid-cols-4">
        {bundles.map((bundle) => (
          <button
            key={bundle.sku}
            disabled={pending}
            onClick={() => buyCredits(bundle.sku)}
            className="group flex cursor-pointer items-baseline justify-between border-b border-navy-950/10 px-4 py-6 text-left last:border-b-0 hover:bg-white disabled:cursor-default disabled:opacity-50 sm:h-full sm:flex-col sm:items-stretch sm:border-b-0 sm:border-r sm:border-navy-950/10 sm:px-8 sm:py-10 sm:last:border-r-0"
          >
            <span className="block text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums text-navy-950">
              {bundle.price}
            </span>
            {/* Narrow, the price sits on one side and everything about it on the other; wide, they
                stack in the grid cell the same way the landing's pricing panel stacks them. */}
            <span className="block text-right sm:mt-4 sm:flex sm:flex-1 sm:flex-col sm:text-left">
              <span className="block text-[0.9375rem] text-navy-700">{bundle.label}</span>
              {/* The per-session price is the comparable number — the totals are not, because they
                  buy different amounts. A bundle is only obviously the better deal once both are
                  divided by the thing the buyer actually spends. */}
              <span className="mt-1 block text-[0.875rem] tabular-nums text-navy-950/55">
                {bundle.perCredit} a session
              </span>
              {/* Kept in the layout when there is nothing to save, so the four cells put their
                  label, their per-session price and their Buy on the same four lines. A row that
                  appears in three cells and not the fourth makes the cheapest bundle look like a
                  different kind of thing. */}
              <span
                aria-hidden={bundle.saving === 0}
                className={`mt-2 self-start bg-gold-100 px-2 py-0.5 text-[0.75rem] font-semibold tabular-nums text-gold-600 ${
                  bundle.saving > 0 ? "inline-block" : "hidden sm:inline-block sm:invisible"
                }`}
              >
                Save {bundle.saving}%
              </span>
              {/* The bundles sit in the same hairline grid as the balance strip above them, which is
                  information. Without this they read as more of it — four facts about prices rather
                  than four things you can click. */}
              <span className="mt-3 block text-[0.875rem] font-semibold text-navy-950 underline underline-offset-4 group-hover:text-gold-600 sm:mt-auto sm:pt-3">
                {pending ? "Starting checkout…" : "Buy"}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
