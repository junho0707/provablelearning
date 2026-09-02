"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { attachCalendarEvent } from "./calendar";
import { sendBookingConfirmationEmail } from "@/lib/notify/booking";

export type BookSessionResult =
  | { ok: true; bookingId: string }
  | { ok: false; code: "denied" | "malformed" | "invalid_profile" | "slot_taken" | "insufficient_credits"; message: string };

const inputSchema = z.object({
  profileId: z.string().uuid(),
  startsAt: z.string().datetime(),
});

type FailureCode = Exclude<BookSessionResult, { ok: true }>["code"];

const ERROR_MESSAGES: Record<string, { code: FailureCode; message: string }> = {
  invalid_profile: { code: "invalid_profile", message: "That profile isn't yours." },
  slot_taken: { code: "slot_taken", message: "That time was just booked. Pick another." },
  insufficient_credits: { code: "insufficient_credits", message: "Not enough credits — buy a pack first." },
  not_authenticated: { code: "denied", message: "Sign in required." },
};

/**
 * TASK-BOOK-001, contract `bookSession`. Reserves a slot + spends one credit atomically via the
 * `book_session` RPC (S7) — this SA is a thin, validated wrapper; every real invariant (ownership,
 * INV-BOOK-1, INV-MONEY-1) is enforced in Postgres, not here (CON2, NFR-SEC-002).
 */
export async function bookSession(input: unknown): Promise<BookSessionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Invalid booking request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  const { data, error } = await supabase.rpc("book_session", {
    p_profile_id: parsed.data.profileId,
    p_starts_at: parsed.data.startsAt,
    p_purchase_id: null,
  });

  if (error) {
    const known = ERROR_MESSAGES[error.message];
    if (known) return { ok: false, ...known };
    return { ok: false, code: "malformed", message: "Could not book that session." };
  }

  const bookingId = data as string;
  // After commit, both best-effort (INV-BOOK-2) — neither a Google nor a Resend failure can undo
  // or fail the booking, which has already committed by this point.
  await attachCalendarEvent(bookingId);
  await sendBookingConfirmationEmail(bookingId);
  return { ok: true, bookingId };
}
