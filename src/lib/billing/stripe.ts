import Stripe from "stripe";

let cached: Stripe | null = null;

/** Lazily constructed so importing this module doesn't require `STRIPE_SECRET_KEY` at build time. */
export function stripeClient(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY.");
  cached = new Stripe(key);
  return cached;
}
