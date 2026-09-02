import { describe, expect, it } from "vitest";
import { PRICING, formatPrice, stripePriceId } from "./pricing";

// TASK-CONFIG-001: prices must match spec/14 §11 exactly, so drift fails CI.

describe("PRICING matches spec/14 §11", () => {
  it("First Session — $49, one per customer (renamed by ADR-005, not a spendable credit)", () => {
    expect(PRICING.first_session.priceCents).toBe(4900);
    expect(PRICING.first_session.name).toBe("First Session");
    expect(PRICING.first_session.credits).toBe(0);
  });

  it("credit packs — 1/$75 · 2/$120 · 4/$200 · 8/$350", () => {
    expect(PRICING.credits_1).toMatchObject({ priceCents: 7500, credits: 1 });
    expect(PRICING.credits_2).toMatchObject({ priceCents: 12000, credits: 2 });
    expect(PRICING.credits_4).toMatchObject({ priceCents: 20000, credits: 4 });
    expect(PRICING.credits_8).toMatchObject({ priceCents: 35000, credits: 8 });
  });
});

describe("formatPrice", () => {
  it("drops a trailing .00", () => {
    expect(formatPrice(4900)).toBe("$49");
  });

  it("keeps cents when not whole dollars", () => {
    expect(formatPrice(4350)).toBe("$43.50");
  });
});

describe("stripePriceId", () => {
  it("throws when the env var is unset", () => {
    delete process.env.STRIPE_PRICE_FIRST_SESSION;
    expect(() => stripePriceId("first_session")).toThrow(/STRIPE_PRICE_FIRST_SESSION/);
  });

  it("returns the env value when set", () => {
    process.env.STRIPE_PRICE_FIRST_SESSION = "price_test_123";
    expect(stripePriceId("first_session")).toBe("price_test_123");
    delete process.env.STRIPE_PRICE_FIRST_SESSION;
  });
});
