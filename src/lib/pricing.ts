/**
 * Single source of truth for prices (spec/14 §11, as amended by ADR-004/005). A test asserts this
 * matches spec/14 exactly, so a silent price drift fails CI.
 */

export type SkuId = "first_session" | "credits_1" | "credits_2" | "credits_4" | "credits_8";

export type PricingSku = {
  id: SkuId;
  /** Buyer-facing SKU name. "First Session", not "Diagnosis" — renamed by ADR-005. */
  name: string;
  priceCents: number;
  /** Sessions this purchase grants. First Session books directly and isn't a spendable credit. */
  credits: number;
  /** Env var holding the live/test Stripe price id for this SKU. */
  stripePriceEnvVar: string;
};

export const PRICING: Record<SkuId, PricingSku> = {
  first_session: {
    id: "first_session",
    name: "First Session",
    priceCents: 4900,
    credits: 0,
    stripePriceEnvVar: "STRIPE_PRICE_FIRST_SESSION",
  },
  credits_1: {
    id: "credits_1",
    name: "1 credit",
    priceCents: 7500,
    credits: 1,
    stripePriceEnvVar: "STRIPE_PRICE_CREDITS_1",
  },
  credits_2: {
    id: "credits_2",
    name: "2 credits",
    priceCents: 12000,
    credits: 2,
    stripePriceEnvVar: "STRIPE_PRICE_CREDITS_2",
  },
  credits_4: {
    id: "credits_4",
    name: "4 credits",
    priceCents: 20000,
    credits: 4,
    stripePriceEnvVar: "STRIPE_PRICE_CREDITS_4",
  },
  credits_8: {
    id: "credits_8",
    name: "8 credits",
    priceCents: 35000,
    credits: 8,
    stripePriceEnvVar: "STRIPE_PRICE_CREDITS_8",
  },
};

/** `$49` or `$60.50` — cents formatted as dollars, no trailing `.00`. */
export function formatPrice(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars.replace(/\.00$/, "")}`;
}

/** The live Stripe price id for a SKU, read from env. Throws if unset — checkout must not silently misprice. */
export function stripePriceId(sku: SkuId): string {
  const envVar = PRICING[sku].stripePriceEnvVar;
  const value = process.env[envVar];
  if (!value) throw new Error(`Missing Stripe price id env var ${envVar} for SKU "${sku}"`);
  return value;
}
