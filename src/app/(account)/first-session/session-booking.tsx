"use client";

import { useMemo, useState, useTransition } from "react";
import { bookFirstSession } from "@/lib/assessment/first-session";

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

export function SessionBooking({ purchaseId, profileId, slots }: { purchaseId: string; profileId: string; slots: string[] }) {
  const grouped = useMemo(() => groupByLocalDate(slots), [slots]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  function confirm() {
    setError(null);
    if (!selected) return setError("Pick a time.");
    startTransition(async () => {
      const result = await bookFirstSession({ profileId, startsAt: selected, purchaseId });
      if (!result.ok) return setError(result.message);
      setConfirmed(selected);
    });
  }

  if (confirmed) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-bold">Booked for {new Date(confirmed).toLocaleString()}.</p>
        <p className="mt-1">A confirmation email is on its way.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                    selected === slot.iso ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 text-navy-800 hover:border-navy-400"
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
        className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        Confirm booking
      </button>
    </div>
  );
}
