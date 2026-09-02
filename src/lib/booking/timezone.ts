/**
 * The weekly availability template is authored as wall-clock time in the operator's own time
 * zone (there is exactly one solo operator — ADR-003) — a rule like "Mondays 9am–5pm" means the
 * operator's local 9am, not a fixed UTC hour, so it doesn't silently shift under them at a DST
 * boundary. Slots are then materialized to UTC for storage (spec/14 §12). Configurable because
 * this is a fact about the operator, not a code constant — defaults to America/New_York only in
 * the absence of an explicit decision.
 */
export const TUTOR_TIMEZONE = process.env.TUTOR_TIMEZONE ?? "America/New_York";

/**
 * Converts a wall-clock date+time in `timeZone` to the UTC instant it names. Handles DST because
 * it asks the IANA tz database what a given UTC guess *renders as* in that zone, then corrects —
 * no date library needed for a single lookup.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // First guess: treat the wall-clock fields as if they were already UTC.
  let guess = Date.UTC(year, month - 1, day, hour, minute);

  // Up to two passes converges even right at a DST transition instant.
  for (let i = 0; i < 2; i++) {
    const rendered = partsInZone(new Date(guess), timeZone);
    const renderedUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute);
    const diff = Date.UTC(year, month - 1, day, hour, minute) - renderedUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** The weekday (0=Sunday..6=Saturday) and calendar date a UTC instant falls on in `timeZone`. */
export function localDateParts(date: Date, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  const parts = partsInZone(date, timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return { ...parts, weekday: weekdayIndex };
}

function partsInZone(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  // Midnight can render as "24" under hour12: false in some environments; normalize to 0.
  const hour = Number(map.hour) % 24;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour, minute: Number(map.minute) };
}
