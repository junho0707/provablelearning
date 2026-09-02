"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bookSession } from "@/lib/booking/book";

type Profile = { id: string; name: string };

/** Groups ISO instants by the **visitor's browser** local calendar date (spec/14 §12: UTC stored, browser TZ displayed). */
function groupByLocalDate(slots: string[]): { dateLabel: string; slots: { iso: string; timeLabel: string }[] }[] {
  const groups = new Map<string, { iso: string; timeLabel: string }[]>();
  for (const iso of slots) {
    const date = new Date(iso);
    const dateKey = date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push({ iso, timeLabel });
  }
  return [...groups.entries()].map(([dateLabel, slots]) => ({ dateLabel, slots }));
}

export function BookingPicker({ slots, profiles, balance }: { slots: string[]; profiles: Profile[]; balance: number }) {
  const router = useRouter();
  const grouped = useMemo(() => groupByLocalDate(slots), [slots]);
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  function confirm() {
    setError(null);
    if (!profileId) return setError("Add a learner profile first.");
    if (!selected) return setError("Pick a time.");
    if (balance < 1) return setError("You're out of credits — buy a pack first.");

    startTransition(async () => {
      const result = await bookSession({ profileId, startsAt: selected });
      if (!result.ok) return setError(result.message);
      setConfirmed(selected);
      setSelected(null);
      router.refresh();
    });
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-xl border border-navy-100 bg-white p-5 text-sm text-navy-700">
        <p className="mb-3">Add a learner profile before booking a session.</p>
        <Link
          href="/account"
          className="inline-block rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
        >
          Add a learner
        </Link>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-bold">Booked for {new Date(confirmed).toLocaleString()}.</p>
        <p className="mt-1">A confirmation email is on its way.</p>
        <button className="mt-3 text-sm font-semibold underline" onClick={() => setConfirmed(null)}>
          Book another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {profiles.length > 1 && (
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {grouped.length === 0 && <p className="text-sm text-navy-500">No open times right now — check back soon.</p>}

      <div className="max-h-96 space-y-4 overflow-y-auto">
        {grouped.map((day) => (
          <div key={day.dateLabel}>
            <h3 className="mb-2 text-sm font-bold text-navy-900">{day.dateLabel}</h3>
            <div className="flex flex-wrap gap-2">
              {day.slots.map((slot) => (
                <button
                  key={slot.iso}
                  onClick={() => setSelected(slot.iso)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    selected === slot.iso
                      ? "border-navy-900 bg-navy-900 text-white"
                      : "border-navy-200 text-navy-800 hover:border-navy-400"
                  }`}
                >
                  {slot.timeLabel}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-error">
          {error}
        </p>
      )}

      <button
        onClick={confirm}
        disabled={pending || !selected}
        className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-40"
      >
        Confirm booking
      </button>
    </div>
  );
}
