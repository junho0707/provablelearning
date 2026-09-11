"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validSubPurpose } from "@/lib/accounts/purposes";
import { getFirstSessionEntitlement, bookFirstSession } from "@/lib/assessment/first-session";
import { attachCalendarEvent } from "./calendar";
import { sendBookingConfirmationEmail } from "@/lib/notify/booking";

export type BookSessionResult =
  | { ok: true; bookingId: string; usedFirstSession: boolean }
  | {
      ok: false;
      code:
        | "denied"
        | "malformed"
        | "invalid_profile"
        | "slot_taken"
        | "insufficient_credits"
        | "too_soon"
        | "beyond_horizon";
      message: string;
    };

const inputSchema = z.object({
  profileId: z.string().uuid(),
  startsAt: z.string().datetime(),
  purpose: z.string().trim().min(1).max(80),
  subPurpose: z.string().trim().max(80).optional().nullable(),
  specifics: z.string().trim().max(2000).optional().nullable(),
  topicMode: z.enum(["new", "continue"]).default("new"),
});

type FailureCode = Exclude<BookSessionResult, { ok: true }>["code"];

const ERROR_MESSAGES: Record<string, { code: FailureCode; message: string }> = {
  invalid_profile: { code: "invalid_profile", message: "That student isn't yours." },
  slot_taken: { code: "slot_taken", message: "That time was just booked. Pick another." },
  insufficient_credits: { code: "insufficient_credits", message: "Not enough credits — buy a bundle first." },
  not_authenticated: { code: "denied", message: "Sign in required." },
  purpose_required: { code: "malformed", message: "Say what the session is for." },
  too_soon: { code: "too_soon", message: "That time is too close now. Pick a later one." },
  beyond_horizon: { code: "beyond_horizon", message: "That's past the booking window. New times open every Monday." },
};

/**
 * Book a session (F5). Reserves the slot and takes payment atomically — every real invariant
 * (ownership, INV-BOOK-1, INV-BOOK-3, INV-MONEY-1) is enforced in Postgres, not here.
 *
 * Payment comes from whichever source applies, and the caller does not choose: if this student
 * still has their unused First Session, that is spent, otherwise a credit is. Letting a buyer pick
 * would let them hold a prepaid session back while spending credits, which serves nobody.
 */
export async function bookSession(input: unknown): Promise<BookSessionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Invalid booking request." };
  if (!validSubPurpose(parsed.data.purpose, parsed.data.subPurpose)) {
    return { ok: false, code: "malformed", message: "Say which test you're preparing for." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  const entitlement = await getFirstSessionEntitlement(parsed.data.profileId);
  if (entitlement) {
    const result = await bookFirstSession({
      profileId: parsed.data.profileId,
      startsAt: parsed.data.startsAt,
      purchaseId: entitlement.purchaseId,
      specifics: parsed.data.specifics ?? null,
    });
    if (!result.ok) {
      const code: FailureCode = result.code === "slot_taken" ? "slot_taken" : "malformed";
      return { ok: false, code, message: result.message };
    }
    return { ok: true, bookingId: result.bookingId, usedFirstSession: true };
  }

  const { data, error } = await supabase.rpc("book_session", {
    p_profile_id: parsed.data.profileId,
    p_starts_at: parsed.data.startsAt,
    p_purpose: parsed.data.purpose,
    p_sub_purpose: parsed.data.subPurpose ?? null,
    p_specifics: parsed.data.specifics ?? null,
    p_topic_mode: parsed.data.topicMode,
    p_purchase_id: null,
  });

  if (error) {
    const known = ERROR_MESSAGES[error.message];
    if (known) return { ok: false, ...known };
    return { ok: false, code: "malformed", message: "Could not book that session." };
  }

  const bookingId = data as string;

  // Both happen after the transaction commits (INV-BOOK-2): a Google or Resend outage must leave a
  // valid booking with a missing link, never roll back a paid booking.
  await attachCalendarEvent(bookingId);
  await sendBookingConfirmationEmail(bookingId);

  return { ok: true, bookingId, usedFirstSession: false };
}
