import { describe, expect, it } from "vitest";
import { createCreditsCheckout, createFirstSessionCheckout } from "./checkout";

// TASK-BILLING-001. These exercise only the validation short-circuit — both functions return
// before touching Supabase/Stripe for malformed input, so no live session/keys are needed. The
// authenticated path (real Stripe session, INV-MONEY-2 pre-check) needs a live Supabase + Stripe
// project; not testable in this environment (same limitation noted for AUTH-001/ACCT-001).

describe("createCreditsCheckout — validation short-circuit", () => {
  it("rejects an unknown sku before touching Supabase or Stripe", async () => {
    const result = await createCreditsCheckout({ sku: "not_a_real_sku" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Unknown credit pack." });
  });

  it("rejects the first_session sku on the credits endpoint", async () => {
    const result = await createCreditsCheckout({ sku: "first_session" });
    expect(result.ok).toBe(false);
  });
});

describe("createFirstSessionCheckout — validation short-circuit", () => {
  it("rejects an unknown goal before touching Supabase or Stripe", async () => {
    const result = await createFirstSessionCheckout({ profileId: "p1", goal: "not_a_real_goal" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Invalid First Session request." });
  });

  it("rejects a missing profileId", async () => {
    const result = await createFirstSessionCheckout({ profileId: "", goal: "strengths" });
    expect(result.ok).toBe(false);
  });
});
