"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { attachCalendarEvent } from "@/lib/booking/calendar";
import { sendBookingConfirmationEmail } from "@/lib/notify/booking";

export type FirstSessionStatus = {
  purchaseId: string;
  goal: "strengths" | "test_prep" | "class_help";
  booked: boolean;
};

/** TASK-FIRST-001, contract for routing: what goal did the buyer state, and is it already booked? */
export async function getFirstSessionStatus(): Promise<FirstSessionStatus | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, goal")
    .eq("account_id", user.id)
    .eq("sku", "first_session")
    .maybeSingle();
  if (!purchase || !purchase.goal) return null;

  const { data: booking } = await supabase.from("bookings").select("id").eq("purchase_id", purchase.id).maybeSingle();

  return { purchaseId: purchase.id, goal: purchase.goal, booked: !!booking };
}

export type BookFirstSessionResult =
  | { ok: true; bookingId: string }
  | { ok: false; code: "denied" | "malformed" | "invalid_profile" | "invalid_purchase" | "already_booked" | "slot_taken"; message: string };

const inputSchema = z.object({ profileId: z.string().uuid(), startsAt: z.string().datetime(), purchaseId: z.string().uuid() });

/**
 * TASK-FIRST-001, `class_help` mode routes straight here (no assessment step, ADR-005) and
 * `strengths`/`test_prep` land here once their assessment is done. No credit is spent — the $49
 * purchase itself is the payment (`book_first_session`, migration 0013).
 */
export async function bookFirstSession(input: unknown): Promise<BookFirstSessionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Invalid booking request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  const { data, error } = await supabase.rpc("book_first_session", {
    p_profile_id: parsed.data.profileId,
    p_starts_at: parsed.data.startsAt,
    p_purchase_id: parsed.data.purchaseId,
  });

  if (error) {
    type FailureCode = Exclude<BookFirstSessionResult, { ok: true }>["code"];
    const known: Partial<Record<string, { code: FailureCode; message: string }>> = {
      invalid_profile: { code: "invalid_profile", message: "That profile isn't yours." },
      invalid_purchase: { code: "invalid_purchase", message: "No First Session purchase found for that." },
      already_booked: { code: "already_booked", message: "This First Session has already been booked." },
      slot_taken: { code: "slot_taken", message: "That time was just booked. Pick another." },
    };
    const match = known[error.message];
    if (match) return { ok: false, ...match };
    return { ok: false, code: "malformed", message: "Could not book that session." };
  }

  const bookingId = data as string;
  await attachCalendarEvent(bookingId);
  await sendBookingConfirmationEmail(bookingId);
  return { ok: true, bookingId };
}
