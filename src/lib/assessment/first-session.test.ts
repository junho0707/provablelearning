import { describe, expect, it } from "vitest";
import { bookFirstSession } from "./first-session";

// TASK-FIRST-001. Validation short-circuit only — same pattern as booking/book.test.ts.

describe("bookFirstSession — validation short-circuit", () => {
  it("rejects a non-uuid profileId", async () => {
    const result = await bookFirstSession({
      profileId: "not-a-uuid",
      startsAt: "2026-06-01T14:00:00.000Z",
      purchaseId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Invalid booking request." });
  });

  it("rejects a missing purchaseId", async () => {
    const result = await bookFirstSession({ profileId: "11111111-1111-1111-1111-111111111111", startsAt: "2026-06-01T14:00:00.000Z" });
    expect(result.ok).toBe(false);
  });
});
