import { describe, expect, it } from "vitest";
import { createCreditsCheckout, createFirstSessionCheckout } from "./checkout";

// TASK-BILLING-001. These exercise only the validation short-circuit — both functions return
// before touching Supabase/Stripe for malformed input, so no live session/keys are needed. The
// authenticated path (real Stripe session, INV-MONEY-2 pre-check) needs a live Supabase + Stripe
// project; not testable in this environment (same limitation noted for AUTH-001/ACCT-001).

describe("createCreditsCheckout — validation short-circuit", () => {
  it("rejects an unknown sku before touching Supabase or Stripe", async () => {
    const result = await createCreditsCheckout({ sku: "not_a_real_sku" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Unknown bundle." });
  });

  it("rejects the first_session sku on the credits endpoint", async () => {
    const result = await createCreditsCheckout({ sku: "first_session" });
    expect(result.ok).toBe(false);
  });
});

describe("createFirstSessionCheckout — validation short-circuit", () => {
  const profileId = "00000000-0000-4000-8000-000000000001";
  const startsAt = "2099-01-05T15:00:00.000Z";

  it("rejects a profileId that isn't a uuid, before touching Supabase or Stripe", async () => {
    const result = await createFirstSessionCheckout({ profileId: "p1", purpose: "school", startsAt });
    expect(result).toEqual({
      ok: false,
      code: "malformed",
      message: "Pick a student, a time, and what the session is for.",
    });
  });

  // The slot is chosen before payment (ADR-009), so a checkout with no time is a request that
  // could only produce a purchase nobody booked.
  it("rejects a missing time", async () => {
    const result = await createFirstSessionCheckout({ profileId, purpose: "school", startsAt: "" });
    expect(result).toEqual({
      ok: false,
      code: "malformed",
      message: "Pick a student, a time, and what the session is for.",
    });
  });

  it("rejects a missing purpose", async () => {
    const result = await createFirstSessionCheckout({ profileId, purpose: "", startsAt });
    expect(result.ok).toBe(false);
  });

  // Test prep is the one purpose that must name a sub-purpose: "SAT" and "ACT" shape different
  // sessions, and a diagnostic cannot be selected without knowing which (system/02-POLICIES.md §7).
  it("rejects test prep with no test named", async () => {
    const result = await createFirstSessionCheckout({ profileId, purpose: "test_prep", startsAt });
    expect(result).toEqual({
      ok: false,
      code: "malformed",
      message: "Say which test you're preparing for.",
    });
  });
});
