import { describe, expect, it } from "vitest";
import { groupByLocalDate } from "./group-slots";

const TZ = "America/Los_Angeles";

describe("groupByLocalDate", () => {
  it("groups by the viewer's calendar day, not UTC's", () => {
    // 01:00Z on the 17th is 18:00 on the 16th in Los Angeles: both instants are one Pacific day.
    const days = groupByLocalDate(
      [
        { iso: "2026-09-16T23:00:00.000Z", released: false },
        { iso: "2026-09-17T01:00:00.000Z", released: false },
      ],
      TZ,
    );
    expect(days).toHaveLength(1);
    expect(days[0].dayKey).toBe("2026-09-16");
    expect(days[0].slots.map((s) => s.timeLabel)).toEqual(["4:00 PM PDT", "6:00 PM PDT"]);
  });

  it("carries the released flag through, so the calendar can mark a freed hour", () => {
    const days = groupByLocalDate(
      [
        { iso: "2026-09-16T23:00:00.000Z", released: true },
        { iso: "2026-09-17T00:00:00.000Z", released: false },
      ],
      TZ,
    );
    expect(days[0].slots.map((s) => s.released)).toEqual([true, false]);
  });
});
