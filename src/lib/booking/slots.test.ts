import { describe, expect, it } from "vitest";
import { generateSlots, horizonEnd, isBookable, type AvailabilityRule, type AvailabilityException } from "./slots";
import { zonedWallTimeToUtc } from "./timezone";

const TZ = "America/New_York";

/** A `[from, to]` pair covering exactly one local calendar day in `TZ` — avoids UTC-midnight
 * boundaries silently pulling in the adjacent local day (UTC midnight is evening in EST/EDT). */
function localDayRange(year: number, month: number, day: number): { from: Date; to: Date } {
  return {
    from: zonedWallTimeToUtc(year, month, day, 0, 0, TZ),
    to: zonedWallTimeToUtc(year, month, day, 23, 59, TZ),
  };
}

describe("generateSlots — weekly template", () => {
  it("generates one slot per hour within a rule's window", () => {
    const rules: AvailabilityRule[] = [{ weekday: 0, startTime: "09:00", endTime: "12:00", active: true }];
    // 2026-03-01 is a Sunday.
    const slots = generateSlots(rules, [], { ...localDayRange(2026, 3, 1), timeZone: TZ });
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-03-01T14:00:00.000Z",
      "2026-03-01T15:00:00.000Z",
      "2026-03-01T16:00:00.000Z",
    ]);
  });

  it("skips inactive rules", () => {
    const rules: AvailabilityRule[] = [{ weekday: 0, startTime: "09:00", endTime: "10:00", active: false }];
    const slots = generateSlots(rules, [], { ...localDayRange(2026, 3, 1), timeZone: TZ });
    expect(slots).toEqual([]);
  });

  it("does not generate a slot on a weekday with no matching rule", () => {
    const rules: AvailabilityRule[] = [{ weekday: 1, startTime: "09:00", endTime: "10:00", active: true }];
    // 2026-03-01 is Sunday (weekday 0), rule is for Monday (1).
    const slots = generateSlots(rules, [], { ...localDayRange(2026, 3, 1), timeZone: TZ });
    expect(slots).toEqual([]);
  });
});

describe("generateSlots — DST boundary (AT-ADMIN-001)", () => {
  it("keeps the same wall-clock hour across the spring-forward transition (2026-03-08)", () => {
    // Two Sundays: one before, one on the US spring-forward date. Same rule, same wall time.
    const rules: AvailabilityRule[] = [{ weekday: 0, startTime: "09:00", endTime: "11:00", active: true }];
    const slots = generateSlots(rules, [], {
      from: localDayRange(2026, 3, 1).from,
      to: localDayRange(2026, 3, 8).to,
      timeZone: TZ,
    });
    const iso = slots.map((s) => s.toISOString());
    // Before DST: EST = UTC-5 → 9am/10am local is 14:00Z/15:00Z.
    expect(iso).toContain("2026-03-01T14:00:00.000Z");
    expect(iso).toContain("2026-03-01T15:00:00.000Z");
    // On/after DST: EDT = UTC-4 → 9am/10am local is 13:00Z/14:00Z, not 14:00Z/15:00Z.
    expect(iso).toContain("2026-03-08T13:00:00.000Z");
    expect(iso).toContain("2026-03-08T14:00:00.000Z");
  });

  it("keeps the same wall-clock hour across the fall-back transition (2026-11-01)", () => {
    const rules: AvailabilityRule[] = [{ weekday: 0, startTime: "09:00", endTime: "10:00", active: true }];
    const slots = generateSlots(rules, [], {
      from: localDayRange(2026, 10, 25).from,
      to: localDayRange(2026, 11, 1).to,
      timeZone: TZ,
    });
    const iso = slots.map((s) => s.toISOString());
    // Before: EDT = UTC-4 → 9am local is 13:00Z.
    expect(iso).toContain("2026-10-25T13:00:00.000Z");
    // After: EST = UTC-5 → 9am local is 14:00Z.
    expect(iso).toContain("2026-11-01T14:00:00.000Z");
  });
});

describe("generateSlots — exceptions", () => {
  const rules: AvailabilityRule[] = [{ weekday: 0, startTime: "09:00", endTime: "12:00", active: true }];

  it("a full-day blackout removes every slot on that date", () => {
    const exceptions: AvailabilityException[] = [{ date: "2026-03-01", kind: "blackout", startTime: null, endTime: null }];
    const slots = generateSlots(rules, exceptions, { ...localDayRange(2026, 3, 1), timeZone: TZ });
    expect(slots).toEqual([]);
  });

  it("a partial blackout removes only the overlapping slots", () => {
    const exceptions: AvailabilityException[] = [
      { date: "2026-03-01", kind: "blackout", startTime: "09:00", endTime: "10:00" },
    ];
    const slots = generateSlots(rules, exceptions, { ...localDayRange(2026, 3, 1), timeZone: TZ });
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-03-01T15:00:00.000Z", "2026-03-01T16:00:00.000Z"]);
  });

  it("an extra exception adds slots outside the weekly template", () => {
    // 2026-03-02 is a Monday — no rule covers it.
    const exceptions: AvailabilityException[] = [
      { date: "2026-03-02", kind: "extra", startTime: "13:00", endTime: "14:00" },
    ];
    const slots = generateSlots(rules, exceptions, { ...localDayRange(2026, 3, 2), timeZone: TZ });
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-03-02T18:00:00.000Z"]);
  });
});

describe("isBookable — 2h notice, Monday-stepped 4-week horizon (AT-BOOK-003/4/5)", () => {
  // 2026-06-01 is a Monday, so the horizon is measured from this very day.
  const now = new Date("2026-06-01T00:00:00Z");

  it("rejects a slot inside the 2h minimum notice", () => {
    expect(isBookable(new Date("2026-06-01T01:00:00Z"), now)).toBe(false);
  });

  it("accepts a slot exactly at the 2h boundary", () => {
    expect(isBookable(new Date("2026-06-01T02:00:00Z"), now)).toBe(true);
  });

  it("accepts a slot within the 4-week horizon", () => {
    expect(isBookable(new Date("2026-06-20T00:00:00Z"), now)).toBe(true);
  });

  it("rejects a slot beyond the 4-week horizon", () => {
    expect(isBookable(new Date("2026-07-15T00:00:00Z"), now)).toBe(false);
  });

  it("accepts a slot exactly at the 4-week boundary", () => {
    expect(isBookable(new Date("2026-06-29T00:00:00Z"), now)).toBe(true);
  });
});

describe("isBookable — a released slot keeps a 1h floor (INV-BOOK-3, AT-BOOK-004)", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("accepts a released slot inside the ordinary 2h floor", () => {
    const slot = new Date("2026-06-01T01:30:00Z");
    expect(isBookable(slot, now)).toBe(false);
    expect(isBookable(slot, now, { released: true })).toBe(true);
  });

  it("accepts a released slot exactly at 1 hour out", () => {
    expect(isBookable(new Date("2026-06-01T01:00:00Z"), now, { released: true })).toBe(true);
  });

  it("rejects a released slot inside the final hour", () => {
    expect(isBookable(new Date("2026-06-01T00:30:00Z"), now, { released: true })).toBe(false);
  });

  it("still applies the horizon to a released slot", () => {
    expect(isBookable(new Date("2026-07-15T00:00:00Z"), now, { released: true })).toBe(false);
  });
});

describe("horizonEnd — steps weekly, does not creep daily (AT-BOOK-005)", () => {
  it("is four weeks from the current Monday, not from today", () => {
    // Monday, and the Thursday of the same week, must see the identical far edge.
    const monday = horizonEnd(new Date("2026-06-01T00:00:00Z"));
    const thursday = horizonEnd(new Date("2026-06-04T09:30:00Z"));
    expect(thursday.toISOString()).toBe(monday.toISOString());
    expect(monday.toISOString()).toBe("2026-06-29T00:00:00.000Z");
  });

  it("gains exactly one week when the next Monday arrives", () => {
    const thisWeek = horizonEnd(new Date("2026-06-07T23:59:00Z")); // Sunday
    const nextWeek = horizonEnd(new Date("2026-06-08T00:00:00Z")); // Monday
    expect(nextWeek.getTime() - thisWeek.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
