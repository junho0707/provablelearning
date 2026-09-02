"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cancelCalendarEvent, updateCalendarEventTime } from "./calendar";

export type CancelResult = { ok: true; refunded: boolean } | { ok: false; code: "denied" | "not_found" | "invalid_state" | "malformed"; message: string };
export type RescheduleResult = { ok: true } | { ok: false; code: "denied" | "not_found" | "invalid_state" | "too_late" | "slot_taken" | "malformed"; message: string };
export type RequestReturnResult = { ok: true; requestId: string } | { ok: false; code: "denied" | "invalid_state" | "malformed"; message: string };

const CANCEL_ERRORS: Record<string, { code: Exclude<CancelResult, { ok: true }>["code"]; message: string }> = {
  not_found: { code: "not_found", message: "Booking not found." },
  invalid_state: { code: "invalid_state", message: "That booking can no longer be cancelled." },
};

/** TASK-BOOK-002, contract `cancelBooking`. Refund/burn decided in Postgres (`cancel_booking`), not here. */
export async function cancelBooking(input: { bookingId: string }): Promise<CancelResult> {
  const parsed = z.string().uuid().safeParse(input.bookingId);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Invalid booking id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  const { data, error } = await supabase.rpc("cancel_booking", { p_booking_id: parsed.data });
  if (error) {
    const known = CANCEL_ERRORS[error.message];
    if (known) return { ok: false, ...known };
    return { ok: false, code: "malformed", message: "Could not cancel that booking." };
  }

  const { data: booking } = await supabase.from("bookings").select("calendar_event_id").eq("id", parsed.data).maybeSingle();
  if (booking?.calendar_event_id) await cancelCalendarEvent(booking.calendar_event_id);

  return { ok: true, refunded: data as boolean };
}

const RESCHEDULE_ERRORS: Record<string, { code: Exclude<RescheduleResult, { ok: true }>["code"]; message: string }> = {
  not_found: { code: "not_found", message: "Booking not found." },
  invalid_state: { code: "invalid_state", message: "That booking can no longer be changed." },
  too_late: { code: "too_late", message: "Reschedule needs at least 24 hours' notice — cancel instead." },
  slot_taken: { code: "slot_taken", message: "That time was just taken. Pick another." },
  new_slot_not_bookable: { code: "too_late", message: "Pick a time at least 24 hours out and within 4 weeks." },
};

/** TASK-BOOK-002, contract `rescheduleBooking`. Only offered ≥24h before the current start — enforced in `reschedule_booking`, not touching the ledger. */
export async function rescheduleBooking(input: { bookingId: string; newSlot: string }): Promise<RescheduleResult> {
  const schema = z.object({ bookingId: z.string().uuid(), newSlot: z.string().datetime() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Invalid reschedule request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  const { error } = await supabase.rpc("reschedule_booking", {
    p_booking_id: parsed.data.bookingId,
    p_new_starts_at: parsed.data.newSlot,
  });
  if (error) {
    const known = RESCHEDULE_ERRORS[error.message];
    if (known) return { ok: false, ...known };
    return { ok: false, code: "malformed", message: "Could not reschedule that booking." };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("calendar_event_id")
    .eq("id", parsed.data.bookingId)
    .maybeSingle();
  if (booking?.calendar_event_id) await updateCalendarEventTime(booking.calendar_event_id, parsed.data.newSlot);

  return { ok: true };
}

/**
 * TASK-BOOK-005, contract `requestCreditReturn`. Valid for any booking the caller owns whose credit
 * was burned — a `no_show`, or a cancellation made inside 24 hours (ADR-006). Eligibility and the
 * one-live-appeal-per-booking rule are enforced in `request_credit_return`, not here.
 */
export async function requestCreditReturn(input: { bookingId: string; reason: string }): Promise<RequestReturnResult> {
  const schema = z.object({ bookingId: z.string().uuid(), reason: z.string().trim().min(1).max(500) });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "malformed", message: "Invalid request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "denied", message: "Sign in required." };

  const { data, error } = await supabase.rpc("request_credit_return", {
    p_booking_id: parsed.data.bookingId,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, code: "invalid_state", message: "That booking isn't eligible for a credit return." };
  return { ok: true, requestId: data as string };
}
