"use client";

import { useState, useTransition } from "react";
import { createFirstSessionCheckout } from "@/lib/billing/checkout";
import { PurposePicker, type PurposeValue } from "@/components/purpose-picker";
import { SlotCalendar } from "@/components/booking/slot-calendar";
import { BTN_GOLD, INPUT, LABEL, NOTICE_ERROR } from "@/lib/ui";

/**
 * Buying a First Session (F4). Everything the session needs is chosen before payment: **which
 * student** — the offer is theirs, not the household's (INV-FIRST-1) — **what the session is for**,
 * which shapes everything either side of the hour, and **when** it happens.
 *
 * The time is asked here rather than after payment (ADR-009) because a buyer picking an hour of
 * their week is choosing whether to buy at all; asking for the card first and the calendar second
 * charges them before they know a time exists that suits them.
 */
export function FirstSessionPurchase({
  eligible,
  price,
  slots,
}: {
  eligible: Array<{ profileId: string; name: string }>;
  price: string;
  slots: string[];
}) {
  const [profileId, setProfileId] = useState(eligible[0]?.profileId ?? "");
  const [purpose, setPurpose] = useState<PurposeValue>({ purpose: null, subPurpose: null });
  const [specifics, setSpecifics] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function buy() {
    setError(null);
    if (!profileId) return setError("Pick who this session is for.");
    if (!purpose.purpose) return setError("Pick what the session is for.");
    if (!selected) return setError("Pick a time for the session.");

    start(async () => {
      const result = await createFirstSessionCheckout({
        profileId,
        purpose: purpose.purpose!,
        subPurpose: purpose.subPurpose,
        startsAt: selected,
        specifics: specifics.trim() || null,
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
          <span className={LABEL}>Who&apos;s this for?</span>
          <select className={INPUT} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {eligible.map((s) => (
              <option key={s.profileId} value={s.profileId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <PurposePicker value={purpose} onChange={setPurpose} />

      <label className="flex flex-col gap-2">
        <span className={LABEL}>Anything specific? (optional)</span>
        <textarea
          className={`${INPUT} min-h-24`}
          value={specifics}
          onChange={(e) => setSpecifics(e.target.value)}
          maxLength={2000}
          placeholder="The unit or topic, an upcoming test, or what they're stuck on."
        />
      </label>

      <div>
        <p className={LABEL}>Pick a time</p>
        <div className="mt-3">
          <SlotCalendar slots={slots} selected={selected} onSelect={setSelected} />
        </div>
      </div>

      {error && (
        <p role="alert" className={NOTICE_ERROR}>
          {error}
        </p>
      )}

      <div>
        <button type="button" onClick={buy} disabled={pending} className={BTN_GOLD}>
          {pending ? "Starting checkout…" : `Book the first session — ${price}`}
        </button>
      </div>

      <p className="text-[0.875rem] leading-relaxed text-navy-950/55">
        Paying books the time you picked, and opens your students&apos; sign-ins so they can do their
        session prep.
      </p>
    </div>
  );
}
