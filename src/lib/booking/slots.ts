import { zonedWallTimeToUtc, localDateParts } from "./timezone";
import {
  BOOKING_HORIZON_MS,
  MIN_NOTICE_MS,
  RELEASED_SLOT_MIN_NOTICE_MS,
  RELEASE_WEEKDAY,
  SESSION_MINUTES,
} from "@/lib/policy";

export type AvailabilityRule = {
  weekday: number; // 0=Sunday..6=Saturday, matches localDateParts
  startTime: string; // "HH:MM", operator wall-clock
  endTime: string; // "HH:MM", exclusive
  active: boolean;
};

export type AvailabilityException = {
  date: string; // "YYYY-MM-DD"
  kind: "blackout" | "extra";
  startTime: string | null; // null on a blackout means the whole day
  endTime: string | null;
};

export {
  SESSION_MINUTES,
  MIN_NOTICE_MS,
  BOOKING_HORIZON_MS,
  RELEASED_SLOT_MIN_NOTICE_MS,
} from "@/lib/policy";

/**
 * TASK-AVAIL-001. Derives concrete UTC session-start instants from the recurring weekly template
 * plus one-off exceptions (spec/14 §12, 07_DATA_MODEL) — nothing is stored per-slot; a "slot" is
 * just an instant this function can regenerate. Iterates the range day by day in `timeZone` (the
 * operator's own clock) so a rule means the same wall-clock hour on both sides of a DST
 * transition, per AT-BOOK-007/spec/14 §12 ("DST is handled by storing absolute instants").
 */
export function generateSlots(
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
  options: { from: Date; to: Date; timeZone: string },
): Date[] {
  const { from, to, timeZone } = options;
  const instants = new Set<number>();

  // Iterate *local calendar days*, not UTC days — a UTC-midnight cursor can land on the previous
  // local date west of Greenwich, silently dropping the first day's rules. A calendar date's
  // weekday is timezone-independent, so once we have the (year, month, day) tuple we can step and
  // read `weekday` with plain UTC arithmetic on those fields — no further zone conversion needed.
  const start = localDateParts(from, timeZone);
  const end = localDateParts(to, timeZone);
  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  const last = Date.UTC(end.year, end.month - 1, end.day);

  for (; cursor <= last; cursor += 24 * 60 * 60 * 1000) {
    const d = new Date(cursor);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const weekday = d.getUTCDay();
    const dateKey = toDateKey(year, month, day);

    const fullDayBlackout = exceptions.some(
      (e) => e.kind === "blackout" && e.date === dateKey && e.startTime === null,
    );
    if (fullDayBlackout) continue;

    const partialBlackouts = exceptions.filter(
      (e) => e.kind === "blackout" && e.date === dateKey && e.startTime !== null,
    );
    const extras = exceptions.filter((e) => e.kind === "extra" && e.date === dateKey);

    const dayRules = rules.filter((r) => r.active && r.weekday === weekday);
    for (const rule of dayRules) {
      for (const minutesOfDay of stepWindow(rule.startTime, rule.endTime)) {
        if (isBlackedOut(minutesOfDay, partialBlackouts)) continue;
        instants.add(toInstant(year, month, day, minutesOfDay, timeZone));
      }
    }

    for (const extra of extras) {
      if (!extra.startTime || !extra.endTime) continue;
      for (const minutesOfDay of stepWindow(extra.startTime, extra.endTime)) {
        instants.add(toInstant(year, month, day, minutesOfDay, timeZone));
      }
    }
  }

  return [...instants].sort((a, b) => a - b).map((ms) => new Date(ms));
}

/**
 * The far edge of the bookable window (`02-POLICIES.md` §2, INV-BOOK-3). The horizon **steps every
 * Monday** rather than creeping forward daily: four weeks are measured from the most recent Monday,
 * so the calendar a buyer sees is stable all week and gains a week at the start of the next one.
 */
export function horizonEnd(now: Date): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // Days since the most recent RELEASE_WEEKDAY, counting today as 0 when today *is* that weekday.
  const sinceRelease = (new Date(midnight).getUTCDay() - RELEASE_WEEKDAY + 7) % 7;
  return new Date(midnight - sinceRelease * 24 * 60 * 60 * 1000 + BOOKING_HORIZON_MS);
}

/**
 * Whether a slot may be booked now. `released` marks a slot freed by a cancellation, which keeps a
 * shorter floor — the operator already holds that hour, so letting it be reclaimed late costs
 * nothing and refusing only wastes it (INV-BOOK-3).
 */
export function isBookable(slot: Date, now: Date, options: { released?: boolean } = {}): boolean {
  const notice = options.released ? RELEASED_SLOT_MIN_NOTICE_MS : MIN_NOTICE_MS;
  const delta = slot.getTime() - now.getTime();
  return delta >= notice && slot.getTime() <= horizonEnd(now).getTime();
}

function* stepWindow(startTime: string, endTime: string): Generator<number> {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  for (let m = start; m + SESSION_MINUTES <= end; m += SESSION_MINUTES) yield m;
}

function isBlackedOut(minutesOfDay: number, blackouts: AvailabilityException[]): boolean {
  return blackouts.some((b) => {
    const start = parseTime(b.startTime!);
    const end = parseTime(b.endTime!);
    return minutesOfDay >= start && minutesOfDay < end;
  });
}

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toInstant(year: number, month: number, day: number, minutesOfDay: number, timeZone: string): number {
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return zonedWallTimeToUtc(year, month, day, hour, minute, timeZone).getTime();
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
