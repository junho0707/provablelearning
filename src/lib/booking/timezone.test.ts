import { describe, expect, it } from "vitest";
import { zonedWallTimeToUtc, localDateParts } from "./timezone";

describe("zonedWallTimeToUtc", () => {
  it("converts winter (EST, UTC-5) wall time correctly", () => {
    const utc = zonedWallTimeToUtc(2026, 1, 15, 9, 0, "America/New_York");
    expect(utc.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("converts summer (EDT, UTC-4) wall time correctly — same wall clock, different UTC offset", () => {
    const utc = zonedWallTimeToUtc(2026, 7, 15, 9, 0, "America/New_York");
    expect(utc.toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("round-trips through localDateParts", () => {
    const utc = zonedWallTimeToUtc(2026, 6, 1, 14, 30, "America/New_York");
    const parts = localDateParts(utc, "America/New_York");
    expect(parts).toMatchObject({ year: 2026, month: 6, day: 1 });
  });
});

describe("localDateParts", () => {
  it("reports the correct weekday index (0=Sunday)", () => {
    // 2026-03-08 is a Sunday.
    const date = new Date("2026-03-08T18:00:00.000Z");
    expect(localDateParts(date, "America/New_York").weekday).toBe(0);
  });

  it("a late-UTC instant can fall on the previous local calendar day", () => {
    // 11pm UTC on Jan 1 is 6pm EST on Jan 1 — not a day-rollover case, so pick one that is:
    // 2am UTC Jan 2 is 9pm EST Jan 1.
    const date = new Date("2026-01-02T02:00:00.000Z");
    const parts = localDateParts(date, "America/New_York");
    expect(parts.day).toBe(1);
  });
});
