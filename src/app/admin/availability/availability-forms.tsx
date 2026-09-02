"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishAvailabilityRule, addAvailabilityException } from "@/lib/admin/availability";

const inputClass = "rounded-lg border border-navy-200 px-3 py-2 text-sm";

export function AvailabilityForms() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");

  const [excDate, setExcDate] = useState("");
  const [excKind, setExcKind] = useState<"blackout" | "extra">("blackout");
  const [excStart, setExcStart] = useState("");
  const [excEnd, setExcEnd] = useState("");

  function addRule() {
    setError(null);
    startTransition(async () => {
      const result = await publishAvailabilityRule({ weekday, startTime, endTime });
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  function addException() {
    setError(null);
    startTransition(async () => {
      const result = await addAvailabilityException({
        date: excDate,
        kind: excKind,
        startTime: excKind === "extra" || excStart ? excStart || null : null,
        endTime: excKind === "extra" || excEnd ? excEnd || null : null,
      });
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-2 text-sm font-bold text-navy-900">Add a weekly rule</h2>
        <div className="flex flex-wrap gap-2">
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={inputClass}>
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
          <button disabled={pending} onClick={addRule} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Add rule
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-navy-900">Add an exception</h2>
        <div className="flex flex-wrap gap-2">
          <input type="date" value={excDate} onChange={(e) => setExcDate(e.target.value)} className={inputClass} />
          <select value={excKind} onChange={(e) => setExcKind(e.target.value as "blackout" | "extra")} className={inputClass}>
            <option value="blackout">Blackout</option>
            <option value="extra">Extra</option>
          </select>
          <input type="time" value={excStart} onChange={(e) => setExcStart(e.target.value)} className={inputClass} placeholder="Start (optional for full-day blackout)" />
          <input type="time" value={excEnd} onChange={(e) => setExcEnd(e.target.value)} className={inputClass} />
          <button disabled={pending} onClick={addException} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Add exception
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
