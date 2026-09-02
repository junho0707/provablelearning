import { describe, expect, it } from "vitest";
import { bookSession } from "./book";

// TASK-BOOK-001. Validation short-circuit only — `bookSession` returns before touching Supabase
// for malformed input. The authenticated path (real RPC call, INV-BOOK-1/INV-MONEY-1 under
// concurrency) needs a live Supabase project; not testable in this environment (see VERIFY.md).

describe("bookSession — validation short-circuit", () => {
  it("rejects a non-uuid profileId", async () => {
    const result = await bookSession({ profileId: "not-a-uuid", startsAt: "2026-06-01T14:00:00.000Z" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Invalid booking request." });
  });

  it("rejects a non-ISO startsAt", async () => {
    const result = await bookSession({ profileId: "11111111-1111-1111-1111-111111111111", startsAt: "not-a-date" });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing profileId", async () => {
    const result = await bookSession({ startsAt: "2026-06-01T14:00:00.000Z" });
    expect(result.ok).toBe(false);
  });
});
