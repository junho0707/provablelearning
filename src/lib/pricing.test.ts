import { describe, expect, it } from "vitest";
import { PRICING, formatPrice, perCreditCents, savingPercent, stripePriceId } from "./pricing";

// TASK-CONFIG-001: prices must match `system/00-BUSINESS.md` §1 exactly, so drift fails CI.

describe("PRICING matches system/00-BUSINESS.md §1", () => {
  it("First Session — $25, one per student (repriced by ADR-008, not a spendable credit)", () => {
    expect(PRICING.first_session.priceCents).toBe(2500);
    expect(PRICING.first_session.name).toBe("First Session");
    expect(PRICING.first_session.credits).toBe(0);
  });

  it("bundles — 1/$75 · 2/$120 · 4/$200 · 8/$350", () => {
    expect(PRICING.credits_1).toMatchObject({ priceCents: 7500, credits: 1 });
    expect(PRICING.credits_2).toMatchObject({ priceCents: 12000, credits: 2 });
    expect(PRICING.credits_4).toMatchObject({ priceCents: 20000, credits: 4 });
    expect(PRICING.credits_8).toMatchObject({ priceCents: 35000, credits: 8 });
  });
});

describe("formatPrice", () => {
  it("drops a trailing .00", () => {
    expect(formatPrice(2500)).toBe("$25");
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

/**
 * The bundle discount is the argument for buying a bigger bundle, so it is derived from the prices
 * rather than written into page copy — a price change must move the saving with it.
 */
describe("per-session pricing", () => {
  it("divides each bundle by what it grants", () => {
    expect(perCreditCents("credits_1")).toBe(7500);
    expect(perCreditCents("credits_2")).toBe(6000);
    expect(perCreditCents("credits_4")).toBe(5000);
    expect(perCreditCents("credits_8")).toBe(4375);
  });

  it("measures the saving against buying one at a time", () => {
    expect(savingPercent("credits_1")).toBe(0);
    expect(savingPercent("credits_2")).toBe(20);
    expect(savingPercent("credits_4")).toBe(33);
    expect(savingPercent("credits_8")).toBe(42);
  });

  it("gets cheaper per session as the bundle gets bigger", () => {
    const bySize = (["credits_1", "credits_2", "credits_4", "credits_8"] as const).map(perCreditCents);
    expect(bySize).toEqual([...bySize].sort((a, b) => b - a));
  });
});
