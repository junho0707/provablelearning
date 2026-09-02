import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRICING, type SkuId } from "@/lib/pricing";
import { sendReceipt } from "@/lib/notify/email";

/**
 * TASK-BILLING-001. The trusted credit/purchase trigger — `08_API_CONTRACTS.md`. Must verify the
 * Stripe signature (NFR-SEC-004) before trusting anything in the payload. Idempotent via
 * `process_purchase`'s insert-first on `stripe_events` (INV-MONEY-3): redelivery returns 200 and
 * changes nothing.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = await request.text();

  if (!signature || !secret) {
    return NextResponse.json({ error: { code: "bad_signature", message: "Missing signature." } }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: { code: "bad_signature", message: "Invalid signature." } }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const accountId = session.metadata?.account_id;
  const sku = session.metadata?.sku as SkuId | undefined;
  const goal = session.metadata?.goal ?? null;

  if (!accountId || !sku || !(sku in PRICING)) {
    // Malformed metadata should never happen from our own checkout session creation, but a
    // webhook is an untrusted trigger surface — fail closed rather than crediting a guess.
    return NextResponse.json({ error: { code: "malformed", message: "Missing purchase metadata." } }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: processed, error } = await admin.rpc("process_purchase", {
    p_event_id: event.id,
    p_account_id: accountId,
    p_sku: sku,
    p_amount_cents: PRICING[sku].priceCents,
    p_credits: PRICING[sku].credits,
    p_goal: goal,
    p_stripe_session_id: session.id,
  });

  if (error) {
    return NextResponse.json({ error: { code: "processing_failed", message: error.message } }, { status: 500 });
  }

  // Only on a genuine first processing — `processed: false` means this was a redelivery no-op
  // (INV-MONEY-3), and sending a second receipt for the same purchase would be a real duplicate,
  // not just a harmless idempotent retry.
  const receiptEmail = session.customer_details?.email ?? session.customer_email;
  if (processed && receiptEmail) {
    await sendReceipt({ to: receiptEmail, sku, amountCents: PRICING[sku].priceCents });
  }

  return NextResponse.json({ received: true });
}
