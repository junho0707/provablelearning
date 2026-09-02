"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { stripePriceId, type SkuId } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import { stripeClient } from "./stripe";

export type CheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; code: "denied" | "already_purchased" | "malformed"; message: string };

const creditsSkuSchema = z.enum(["credits_1", "credits_2", "credits_4", "credits_8"]);

/** TASK-BILLING-001. `REQ-BILLING-001`, F7. */
export async function createCreditsCheckout(input: { sku: string }): Promise<CheckoutResult> {
  const parsed = creditsSkuSchema.safeParse(input.sku);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Unknown credit pack." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  return startCheckout(user.id, user.email ?? undefined, parsed.data, null);
}

const goalSchema = z.enum(["strengths", "test_prep", "class_help"]);

/**
 * TASK-BILLING-001. `REQ-FIRST-001`, F5. `profileId` is accepted for the caller's future session
 * linkage (TASK-FIRST-001) but not validated here — First Session purchase precedes the assessment
 * flow that needs it.
 */
export async function createFirstSessionCheckout(input: {
  profileId: string;
  goal: string;
}): Promise<CheckoutResult> {
  const goal = goalSchema.safeParse(input.goal);
  if (!goal.success || !input.profileId) {
    return { ok: false, code: "malformed", message: "Invalid First Session request." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  // INV-MONEY-2 (ADR-005): checked here as the first line of defense; the partial unique index on
  // `purchases` (migration 0004) is the backstop that makes it true under concurrency.
  const { data: existing } = await supabase
    .from("purchases")
    .select("id")
    .eq("account_id", user.id)
    .eq("sku", "first_session")
    .maybeSingle();
  if (existing) {
    return { ok: false, code: "already_purchased", message: "First Session already purchased." };
  }

  return startCheckout(user.id, user.email ?? undefined, "first_session", goal.data);
}

async function startCheckout(
  accountId: string,
  email: string | undefined,
  sku: SkuId,
  goal: string | null,
): Promise<CheckoutResult> {
  const stripe = stripeClient();
  const sessionUrl = `${SITE_URL}${goal ? "/first-session" : "/credits"}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    line_items: [{ price: stripePriceId(sku), quantity: 1 }],
    metadata: { account_id: accountId, sku, ...(goal ? { goal } : {}) },
    success_url: `${sessionUrl}?purchase=success`,
    cancel_url: `${sessionUrl}?purchase=cancelled`,
  });

  if (!session.url) {
    return { ok: false, code: "malformed", message: "Could not start checkout." };
  }
  return { ok: true, checkoutUrl: session.url };
}
