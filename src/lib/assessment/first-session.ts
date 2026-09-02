"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { attachCalendarEvent } from "@/lib/booking/calendar";
import { sendBookingConfirmationEmail } from "@/lib/notify/booking";

/**
 * The First Session entitlement (F4).
 *
 * ADR-007 collapsed what used to be a separate "First Session flow" into the ordinary booking
 * path: a First Session and a credit session are the same session, with the same preparation and
 * the same materials — only the payment differs. So this module no longer routes anyone anywhere.
 * It answers one question for the booking form ("is this session already paid for?") and performs
 * the booking that spends no credit.
 */

export type FirstSessionEntitlement = {
  purchaseId: string;
  profileId: string;
  purpose: string;
  subPurpose: string | null;
};

/**
 * The named student's unused First Session, if they have one. Per student, not per account
 * (INV-FIRST-1) — a sibling's entitlement is not available here.
 */
export async function getFirstSessionEntitlement(profileId: string): Promise<FirstSessionEntitlement | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, profile_id, purpose, sub_purpose")
    .eq("profile_id", profileId)
    .eq("sku", "first_session")
    .maybeSingle();
  if (!purchase) return null;

  const { data: booking } = await supabase
    .from("bookings")
    .select("id")
    .eq("purchase_id", purchase.id)
    .maybeSingle();
  if (booking) return null; // Already used.

  return {
    purchaseId: purchase.id as string,
    profileId: purchase.profile_id as string,
    purpose: (purchase.purpose as string) ?? "",
    subPurpose: (purchase.sub_purpose as string | null) ?? null,
  };
}

/** Every student on the account who has not yet bought their First Session (F4 step 2). */
export async function listFirstSessionEligible(): Promise<Array<{ profileId: string; name: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("students_eligible_for_first_session");
  if (error || !data) return [];
  return (data as Array<{ profile_id: string; name: string }>).map((row) => ({
    profileId: row.profile_id,
    name: row.name,
  }));
}

export type BookFirstSessionResult =
  | { ok: true; bookingId: string }
  | {
      ok: false;
      code: "denied" | "malformed" | "invalid_profile" | "invalid_purchase" | "already_booked" | "slot_taken";
      message: string;
    };

const inputSchema = z.object({
  profileId: z.string().uuid(),
  startsAt: z.string().datetime(),
  purchaseId: z.string().uuid(),
});

/**
 * Book a session against the First Session entitlement. No credit is spent — the $49 purchase
 * itself is the payment (`book_first_session`, migrations 0013 + 0018).
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
      invalid_profile: { code: "invalid_profile", message: "That student isn't yours." },
      invalid_purchase: { code: "invalid_purchase", message: "No first session found for that student." },
      already_booked: { code: "already_booked", message: "This first session has already been booked." },
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
