/**
 * Every human-readable time in the product, rendered in an **explicit** time zone.
 *
 * Nothing here may fall back to the ambient zone. `toLocaleString(undefined, …)` uses whatever
 * zone the process happens to be in — the visitor's browser on the client, but the *server's* on a
 * server component, which is UTC on Vercel. That is how a 12:00 PM Eastern session rendered as
 * "4:00 PM" in production while looking correct on an Eastern laptop in dev.
 *
 * The zone is always named in the output. A buyer in Los Angeles and a tutor in New York are
 * looking at the same hour under two different numbers, and an unlabelled one is a guess.
 */

const LONG_DATE: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
};

/** "Saturday, September 12 at 12:00 PM EDT" — the canonical way to state when a session is. */
export function sessionTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { ...LONG_DATE, timeZone }).format(date);
  return `${day} at ${clockTime(iso, timeZone)}`;
}

/** "12:00 PM EST" — the time alone, for lists already grouped under a date. */
export function clockTime(iso: string, timeZone: string): string {
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
  return `${time} ${zoneAbbreviation(timeZone, new Date(iso))}`;
}

/**
 * "Sep 12, 2026, 12:00 PM EST" — compact, for history rows and admin tables.
 *
 * The zone is appended rather than asked of `timeZoneName`, which ICU refuses to combine with
 * `dateStyle`/`timeStyle` anyway. Without the label these rows read as a bare local time, and the
 * one reader who must never mistake the zone is the operator scheduling against it.
 */
export function stampTime(iso: string, timeZone: string): string {
  const stamp = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
  return `${stamp} ${zoneAbbreviation(timeZone, new Date(iso))}`;
}

/** "Sep 12, 2026" — a date with no time of day. */
export function stampDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(new Date(iso));
}

/**
 * How we spell a zone: "EST", "PDT", "GMT+5:30".
 *
 * `Intl` is literal and prints EDT for the eight months Eastern is on daylight time. The business
 * calls its own zone EST all year — the way a customer says it — so that is what we print, and the
 * hour beside it is the real local hour either way. Only the label is pinned, never the arithmetic.
 */
const ZONE_LABELS: Record<string, string> = {
  "America/New_York": "EST",
};

export function zoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  const pinned = ZONE_LABELS[timeZone];
  if (pinned) return pinned;

  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** Whether a zone string is one the platform actually knows, so a junk cookie can't throw. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
