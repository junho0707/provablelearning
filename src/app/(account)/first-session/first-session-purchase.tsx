"use client";

import { useState, useTransition } from "react";
import { createFirstSessionCheckout } from "@/lib/billing/checkout";
import { PurposePicker, type PurposeValue } from "@/components/purpose-picker";

/**
 * Buying a First Session (F4). Two things are chosen before payment: **which student** — the offer
 * is theirs, not the household's (INV-FIRST-1) — and **what the session is for**, which shapes
 * everything that happens either side of the hour.
 */
export function FirstSessionPurchase({
  eligible,
  price,
}: {
  eligible: Array<{ profileId: string; name: string }>;
  price: string;
}) {
  const [profileId, setProfileId] = useState(eligible[0]?.profileId ?? "");
  const [purpose, setPurpose] = useState<PurposeValue>({ purpose: null, subPurpose: null });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function buy() {
    setError(null);
    if (!profileId) return setError("Pick who this session is for.");
    if (!purpose.purpose) return setError("Pick what the session is for.");

    start(async () => {
      const result = await createFirstSessionCheckout({
        profileId,
        purpose: purpose.purpose!,
        subPurpose: purpose.subPurpose,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.location.href = result.checkoutUrl;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {eligible.length > 1 && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-navy-900">Who&apos;s this for?</span>
          <select
            className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-navy-400"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {eligible.map((s) => (
              <option key={s.profileId} value={s.profileId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <PurposePicker value={purpose} onChange={setPurpose} />

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={buy}
        disabled={pending}
        className="rounded-lg bg-gold-500 px-6 py-3 font-bold text-navy-950 hover:bg-gold-400 disabled:opacity-60"
      >
        {pending ? "Starting checkout…" : `Book the first session — ${price}`}
      </button>

      <p className="text-sm text-navy-600">
        You&apos;ll pick a time next. Paying also opens your students&apos; sign-ins, so they can do
        their session prep.
      </p>
    </div>
  );
}
