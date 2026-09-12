import { clockTime } from "@/lib/time-format";

/**
 * Calendar date as `YYYY-MM-DD`, as the instant falls in `timeZone`.
 *
 * Not `toISOString`, which would shift the day in any zone behind UTC and land an evening slot on
 * tomorrow's cell — and not `getFullYear()`, which reads the *ambient* zone and so disagrees with
 * itself between a server render (UTC on Vercel) and the browser that hydrates it.
 *
 * `en-CA` formats as `YYYY-MM-DD`, which is the key format, so no reassembly is needed.
 */
export function localDayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Groups ISO instants by the calendar date they fall on **in the viewer's zone**.
 *
 * Used by the booking calendar, which needs both a machine key to match a slot to a grid cell and
 * a human label to head the list of times under it. Times carry their zone, so a Pacific buyer
 * reading "9:00 AM PDT" cannot mistake it for the tutor's Eastern morning.
 */
export function groupByLocalDate(slots: string[], timeZone: string) {
  const groups = new Map<string, { iso: string; timeLabel: string }[]>();
  const labels = new Map<string, string>();
  for (const iso of slots) {
    const date = new Date(iso);
    const dateKey = localDayKey(date, timeZone);
    labels.set(
      dateKey,
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(date),
    );
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push({ iso, timeLabel: clockTime(iso, timeZone) });
  }
  return [...groups.entries()].map(([dayKey, slots]) => ({
    dayKey,
    dateLabel: labels.get(dayKey)!,
    slots,
  }));
}

/**
 * The calendar grid's cells are **dates, not instants** — "September 12" is the same cell whatever
 * zone you read it from. Representing each as UTC noon keeps a day's worth of slack either side of
 * every DST transition, so stepping a week never lands on the previous or next date.
 */
export function dayCell(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function cellKey(cell: Date): string {
  return cell.toISOString().slice(0, 10);
}

export function addDayCells(cell: Date, days: number): Date {
  return new Date(cell.getTime() + days * 86_400_000);
}

/** Midnight-anchored Monday of the week this calendar date falls in. */
export function mondayCellOf(cell: Date): Date {
  return addDayCells(cell, -((cell.getUTCDay() + 6) % 7));
}

/** The day number shown in a grid cell. */
export function cellDayNumber(cell: Date): number {
  return cell.getUTCDate();
}
