"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Has the webhook for this checkout landed yet?
 *
 * Stripe returns the buyer the instant the card clears, a second or two ahead of the webhook that
 * records the purchase (`03-FLOWS.md` F3/F4). The return page therefore has to wait for something
 * — and the only honest thing to wait for is *this* purchase, named by the checkout session it
 * came from. A balance or a booking count cannot tell a purchase that just landed apart from one
 * that was already there.
 *
 * RLS (`purchases_select_own`) scopes the read to the caller, so this can never report another
 * buyer's purchase as the current one's.
 */
export async function purchaseRecorded(stripeSessionId: string): Promise<boolean> {
  if (!stripeSessionId.startsWith("cs_")) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("purchases")
    .select("id")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();

  return data !== null;
}
