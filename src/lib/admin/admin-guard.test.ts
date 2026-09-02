import { describe, expect, it, vi } from "vitest";

// TASK-ADMIN-001, AT-SEC-002: a non-admin (here, a signed-out caller — the only case testable
// without a live Supabase session) is denied every admin action, before any input is even
// validated. The full case (signed-in non-admin denied, admin allowed) needs a live project; not
// testable in this environment (see VERIFY.md).

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

const { publishAvailabilityRule, addAvailabilityException, closeAvailabilityRule } = await import("./availability");
const { markNoShow } = await import("./bookings");
const { resolveCreditReturnRequest } = await import("./credit-returns");
const { issueRefund } = await import("./refunds");
const { createQuestion, updateQuestion, deleteQuestion } = await import("./questions");

describe("every admin action is denied without a session", () => {
  it("publishAvailabilityRule", async () => {
    expect(await publishAvailabilityRule({ weekday: 1, startTime: "09:00", endTime: "10:00" })).toEqual({
      ok: false,
      message: "Admin only.",
    });
  });

  it("closeAvailabilityRule", async () => {
    expect(await closeAvailabilityRule("rule-1")).toEqual({ ok: false, message: "Admin only." });
  });

  it("addAvailabilityException", async () => {
    expect(await addAvailabilityException({ date: "2026-06-01", kind: "blackout", startTime: null, endTime: null })).toEqual({
      ok: false,
      message: "Admin only.",
    });
  });

  it("markNoShow", async () => {
    expect(await markNoShow("11111111-1111-1111-1111-111111111111")).toEqual({ ok: false, message: "Admin only." });
  });

  it("resolveCreditReturnRequest", async () => {
    expect(await resolveCreditReturnRequest("11111111-1111-1111-1111-111111111111", "approved")).toEqual({
      ok: false,
      message: "Admin only.",
    });
  });

  it("issueRefund", async () => {
    expect(
      await issueRefund({ accountId: "11111111-1111-1111-1111-111111111111", amount: 1, note: "test" }),
    ).toEqual({ ok: false, message: "Admin only." });
  });

  it("createQuestion", async () => {
    expect(
      await createQuestion({
        lessonSlug: "x",
        position: 0,
        type: "mcq",
        prompt: "p",
        choices: [],
        answer: "a",
        tolerance: null,
        explanation: "e",
      }),
    ).toEqual({ ok: false, message: "Admin only." });
  });

  it("updateQuestion", async () => {
    expect(await updateQuestion("11111111-1111-1111-1111-111111111111", { prompt: "new" })).toEqual({
      ok: false,
      message: "Admin only.",
    });
  });

  it("deleteQuestion", async () => {
    expect(await deleteQuestion("11111111-1111-1111-1111-111111111111")).toEqual({ ok: false, message: "Admin only." });
  });
});
