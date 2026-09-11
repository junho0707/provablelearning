"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { stripePriceId, type SkuId } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import { validSubPurpose } from "@/lib/accounts/purposes";
import { stripeClient } from "./stripe";

export type CheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; code: "denied" | "already_purchased" | "malformed"; message: string };

const creditsSkuSchema = z.enum(["credits_1", "credits_2", "credits_4", "credits_8"]);

/** Bundle checkout (F3). Bundles top up a shared wallet, so they name no student. */
export async function createCreditsCheckout(input: { sku: string }): Promise<CheckoutResult> {
  const parsed = creditsSkuSchema.safeParse(input.sku);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Unknown bundle." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  return startCheckout({ accountId: user.id, email: user.email ?? undefined, sku: parsed.data });
}

const firstSessionSchema = z.object({
  profileId: z.string().uuid(),
  purpose: z.string().trim().min(1).max(80),
  subPurpose: z.string().trim().max(80).optional().nullable(),
  startsAt: z.string().datetime(),
  specifics: z.string().trim().max(2000).optional().nullable(),
});

/**
 * First Session checkout (F4). **Per student, not per account** (ADR-007 §4) — the student is
 * chosen before payment, both because the offer belongs to them and because the purchase is what
 * records parental consent for the household.
 *
 * The **time** is chosen before payment too (ADR-009) and rides along in the Stripe session's
 * metadata, so the webhook that records the purchase also books the session. Nothing holds the slot
 * through checkout; if it is gone by the time the webhook lands, the buyer keeps the paid
 * entitlement and spends it on `/book`.
 */
export async function createFirstSessionCheckout(input: {
  profileId: string;
  purpose: string;
  subPurpose?: string | null;
  startsAt: string;
  specifics?: string | null;
}): Promise<CheckoutResult> {
  const parsed = firstSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "malformed", message: "Pick a student, a time, and what the session is for." };
  }
  if (!validSubPurpose(parsed.data.purpose, parsed.data.subPurpose)) {
    return { ok: false, code: "malformed", message: "Say which test you're preparing for." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  // The student must be the caller's. RLS would deny the read anyway; checking explicitly turns a
  // silent empty result into a clear message.
  const { data: profile } = await supabase
    .from("learner_profiles")
    .select("id")
    .eq("id", parsed.data.profileId)
    .maybeSingle();
  if (!profile) return { ok: false, code: "denied", message: "That student isn't yours." };

  // INV-FIRST-1, first line of defence. The partial unique index on `purchases(profile_id)`
  // (migration 0018) is the backstop that makes it true under concurrency.
  const { data: existing } = await supabase
    .from("purchases")
    .select("id")
    .eq("profile_id", parsed.data.profileId)
    .eq("sku", "first_session")
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      code: "already_purchased",
      message: "This student has already used their first session — bundles are next.",
    };
  }

  return startCheckout({
    accountId: user.id,
    email: user.email ?? undefined,
    sku: "first_session",
    purpose: parsed.data.purpose,
    subPurpose: parsed.data.subPurpose ?? null,
    profileId: parsed.data.profileId,
    startsAt: parsed.data.startsAt,
    specifics: parsed.data.specifics ?? null,
  });
}

async function startCheckout(input: {
  accountId: string;
  email: string | undefined;
  sku: SkuId;
  purpose?: string;
  subPurpose?: string | null;
  profileId?: string;
  startsAt?: string;
  specifics?: string | null;
}): Promise<CheckoutResult> {
  const stripe = stripeClient();
  // A paid First Session is already booked by the time the buyer is back, so the dashboard — where
  // that session now sits — is the only page that can honestly answer "did it work?". Credits are
  // bought in order to spend them, so a bundle returns to `/sessions`, which is where the booking
  // is made; the balance itself is one click away on `/credits`.
  const returnPath = input.sku === "first_session" ? "/dashboard" : "/sessions";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    line_items: [{ price: stripePriceId(input.sku), quantity: 1 }],
    metadata: {
      account_id: input.accountId,
      sku: input.sku,
      ...(input.purpose ? { purpose: input.purpose } : {}),
      ...(input.subPurpose ? { sub_purpose: input.subPurpose } : {}),
      ...(input.profileId ? { profile_id: input.profileId } : {}),
      ...(input.startsAt ? { starts_at: input.startsAt } : {}),
      ...(input.specifics ? { specifics: input.specifics } : {}),
    },
    success_url: `${SITE_URL}${returnPath}?purchase=success`,
    cancel_url: `${SITE_URL}${returnPath}?purchase=cancelled`,
  });

  if (!session.url) {
    return { ok: false, code: "malformed", message: "Could not start checkout." };
  }
  return { ok: true, checkoutUrl: session.url };
}
