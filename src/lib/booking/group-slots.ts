/** Local calendar date as `YYYY-MM-DD`. Not `toISOString`, which would shift the day in any
 *  time zone behind UTC and land an evening slot on tomorrow's cell. */
export function localDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Groups ISO instants by the **visitor's** local calendar date (UTC stored, browser TZ displayed).
 *
 * Used by the booking calendar, which needs both a machine key to match a slot to a grid cell and
 * a human label to head the list of times under it.
 */
export function groupByLocalDate(slots: string[]) {
  const groups = new Map<string, { iso: string; timeLabel: string }[]>();
  const labels = new Map<string, string>();
  for (const iso of slots) {
    const date = new Date(iso);
    const dateKey = localDayKey(date);
    labels.set(
      dateKey,
      date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    );
    const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push({ iso, timeLabel });
  }
  return [...groups.entries()].map(([dayKey, slots]) => ({
    dayKey,
    dateLabel: labels.get(dayKey)!,
    slots,
  }));
}
