import { describe, expect, it } from "vitest";
import { cancelBooking, rescheduleBooking, requestCreditReturn } from "./manage";

// TASK-BOOK-002/BOOK-005. Validation short-circuit only — see book.test.ts for why.

describe("cancelBooking — validation short-circuit", () => {
  it("rejects a non-uuid bookingId", async () => {
    const result = await cancelBooking({ bookingId: "not-a-uuid" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Invalid booking id." });
  });
});

describe("rescheduleBooking — validation short-circuit", () => {
  it("rejects a non-uuid bookingId", async () => {
    const result = await rescheduleBooking({ bookingId: "not-a-uuid", newSlot: "2026-06-01T14:00:00.000Z" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-ISO newSlot", async () => {
    const result = await rescheduleBooking({
      bookingId: "11111111-1111-1111-1111-111111111111",
      newSlot: "not-a-date",
    });
    expect(result.ok).toBe(false);
  });
});

describe("requestCreditReturn — validation short-circuit", () => {
  it("rejects an empty reason", async () => {
    const result = await requestCreditReturn({ bookingId: "11111111-1111-1111-1111-111111111111", reason: "" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Invalid request." });
  });

  it("rejects a non-uuid bookingId", async () => {
    const result = await requestCreditReturn({ bookingId: "not-a-uuid", reason: "I was there on time" });
    expect(result.ok).toBe(false);
  });
});
