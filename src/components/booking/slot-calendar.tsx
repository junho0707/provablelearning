"use client";

import { useMemo, useState } from "react";
import {
  addDayCells,
  cellDayNumber,
  cellKey,
  dayCell,
  groupByLocalDate,
  localDayKey,
  mondayCellOf,
} from "@/lib/booking/group-slots";
import { EYEBROW, NOTICE } from "@/lib/ui";

/** Monday-first, matching the Monday-stepped release cadence the horizon already follows. */
const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The open hours as a calendar: a month-style grid to pick the day, then that day's times beneath
 * it. The flat day-by-day list this replaces worked when a week was visible at once, but the
 * horizon is four weeks (`system/02-POLICIES.md` §2) and reading "which Tuesdays are free?" off a
 * vertical list means scanning every row.
 *
 * Weeks rather than calendar months, because the horizon is measured in weeks and a month grid
 * would open on a mostly-empty page whenever the 1st falls late in the window.
 *
 * Every label is rendered from the visitor's own time zone, never the tutor's — the grid has to
 * agree with the times listed under it about which day a late-evening slot belongs to, which is
 * what `localDayKey` is for.
 */
export function SlotCalendar({
  slots,
  selected,
  onSelect,
  timeZone,
}: {
  slots: string[];
  selected: string | null;
  onSelect: (iso: string) => void;
  timeZone: string;
}) {
  const days = useMemo(() => groupByLocalDate(slots, timeZone), [slots, timeZone]);
  const byDay = useMemo(() => new Map(days.map((d) => [d.dayKey, d])), [days]);

  const [openDay, setOpenDay] = useState<string | null>(null);
  // Until the buyer picks a day, show the soonest one that has anything — an empty panel under a
  // grid full of open days reads as broken.
  const activeDay = openDay ?? days[0]?.dayKey ?? null;
  const active = activeDay ? byDay.get(activeDay) : undefined;

  const weeks = useMemo(() => {
    if (days.length === 0) return [];
    const first = mondayCellOf(dayCell(localDayKey(new Date(), timeZone)));
    const last = dayCell(days[days.length - 1].dayKey);
    const rows: Date[][] = [];
    for (let cursor = first; cursor <= last && rows.length < 8; cursor = addDayCells(cursor, 7)) {
      rows.push(Array.from({ length: 7 }, (_, i) => addDayCells(cursor, i)));
    }
    return rows;
  }, [days, timeZone]);

  if (days.length === 0) {
    return (
      <p className={`${NOTICE} text-center`}>
        No open times right now. New times open every Monday.
      </p>
    );
  }

  const todayKey = localDayKey(new Date(), timeZone);

  return (
    <div>
      <div className="grid grid-cols-7 border-t border-navy-950/10">
        {WEEKDAY_HEADS.map((head) => (
          <div key={head} className={`px-1 py-2 text-center ${EYEBROW}`}>
            <span className="hidden sm:inline">{head}</span>
            <span className="sm:hidden">{head[0]}</span>
          </div>
        ))}

        {weeks.flat().map((date) => {
          const key = cellKey(date);
          const group = byDay.get(key);
          const isActive = key === activeDay;

          if (!group) {
            return (
              <div
                key={key}
                className="border-b border-l border-navy-950/10 px-1 py-2 text-center [&:nth-child(7n)]:border-r [&:nth-child(7n+1)]:border-l-0"
              >
                <span
                  className={`text-[0.875rem] tabular-nums ${
                    key === todayKey ? "font-semibold text-navy-950/45" : "text-navy-950/25"
                  }`}
                >
                  {cellDayNumber(date)}
                </span>
              </div>
            );
          }

          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              aria-label={`${group.dateLabel} — ${group.slots.length} open ${
                group.slots.length === 1 ? "time" : "times"
              }`}
              onClick={() => setOpenDay(key)}
              className={`border-b border-l border-navy-950/10 px-1 py-2 text-center [&:nth-child(7n)]:border-r [&:nth-child(7n+1)]:border-l-0 ${
                isActive ? "bg-navy-950 text-white" : "bg-white hover:bg-gold-100"
              }`}
            >
              <span className="block text-[0.875rem] font-semibold tabular-nums">
                {cellDayNumber(date)}
              </span>
              <span
                className={`mt-0.5 block text-[0.6875rem] tabular-nums ${
                  isActive ? "text-white/70" : "text-navy-950/55"
                }`}
              >
                {group.slots.length}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="mt-6">
          <p className={`mb-3 ${EYEBROW}`}>{active.dateLabel}</p>
          <div className="flex flex-wrap gap-2">
            {active.slots.map((slot) => (
              <button
                key={slot.iso}
                type="button"
                aria-pressed={selected === slot.iso}
                onClick={() => onSelect(slot.iso)}
                className={`border px-3 py-2 text-[0.875rem] font-semibold tabular-nums ${
                  selected === slot.iso
                    ? "border-navy-950 bg-navy-950 text-white"
                    : "border-navy-950/15 bg-white text-navy-800 hover:border-navy-950"
                }`}
              >
                {slot.timeLabel}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
