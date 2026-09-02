"use client";

import { useState, useTransition } from "react";
import { createCreditsCheckout, createFirstSessionCheckout } from "@/lib/billing/checkout";
import type { SkuId } from "@/lib/pricing";

const packButtonClass =
  "w-full rounded-lg border border-navy-200 px-4 py-2.5 text-left text-sm font-semibold text-navy-900 transition hover:border-navy-400 disabled:cursor-not-allowed disabled:opacity-50";

const productCardClass =
  "w-full rounded-lg border border-navy-200 p-4 text-left transition hover:border-navy-400";

const selectClass = "w-full rounded-lg border border-navy-200 px-3 py-2 text-sm";

const backButtonClass = "text-xs font-semibold text-navy-500 hover:text-navy-800";

type Product = "first_session" | "credits";

/**
 * Two-step purchase: pick the product first (First Session vs. a credit pack), then — only for
 * First Session — ask why, so the reason question doesn't compete with the product choice.
 */
export function BuyCredits({
  hasFirstSession,
  firstSessionPrice,
  profiles,
  creditPacks,
}: {
  hasFirstSession: boolean;
  firstSessionPrice: string;
  profiles: { id: string; name: string }[];
  creditPacks: { sku: SkuId; label: string; price: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [product, setProduct] = useState<Product | null>(null);
  const [goal, setGoal] = useState<"strengths" | "test_prep" | "class_help">("strengths");
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");

  function goToCheckout(url: string) {
    window.location.href = url;
  }

  function buyCredits(sku: SkuId) {
    setError(null);
    startTransition(async () => {
      const result = await createCreditsCheckout({ sku });
      if (!result.ok) return setError(result.message);
      goToCheckout(result.checkoutUrl);
    });
  }

  function buyFirstSession() {
    setError(null);
    if (!profileId) return setError("Add a learner profile first.");
    startTransition(async () => {
      const result = await createFirstSessionCheckout({ profileId, goal });
      if (!result.ok) return setError(result.message);
      goToCheckout(result.checkoutUrl);
    });
  }

  function back() {
    setError(null);
    setProduct(null);
  }

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-navy-400">Buy</p>
      {error && <p className="mb-3 text-sm font-semibold text-error">{error}</p>}

      {product === null && (
        <div className="space-y-2">
          {!hasFirstSession && (
            <button className={productCardClass} onClick={() => setProduct("first_session")}>
              <span className="block text-sm font-bold text-navy-950">
                First Session — {firstSessionPrice}
              </span>
              <span className="mt-1 block text-sm text-navy-600">
                One-time, before your first credit pack.
              </span>
            </button>
          )}
          <button className={productCardClass} onClick={() => setProduct("credits")}>
            <span className="block text-sm font-bold text-navy-950">Credit packs</span>
            <span className="mt-1 block text-sm text-navy-600">
              Buy sessions to use whenever you&apos;re ready.
            </span>
          </button>
        </div>
      )}

      {product === "first_session" && (
        <div className="space-y-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-navy-950">First Session — {firstSessionPrice}</h3>
            <button onClick={back} className={backButtonClass}>
              Back
            </button>
          </div>
          <label className="block text-xs font-semibold text-navy-600">What are you going for?</label>
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value as typeof goal)}
            className={selectClass}
          >
            <option value="strengths">Find my strengths &amp; next steps</option>
            <option value="test_prep">Prep for a test</option>
            <option value="class_help">Help with my current class</option>
          </select>
          {profiles.length > 1 && (
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className={selectClass}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button className={packButtonClass} disabled={pending} onClick={buyFirstSession}>
            Book my first session — {firstSessionPrice}
          </button>
        </div>
      )}

      {product === "credits" && (
        <div className="space-y-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-navy-950">Credit packs</h3>
            <button onClick={back} className={backButtonClass}>
              Back
            </button>
          </div>
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
      )}
    </div>
  );
}
