"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateSlots,
  isBookable,
  horizonEnd,
  type AvailabilityRule,
  type AvailabilityException,
  type OpenSlot,
} from "./slots";
import { TUTOR_TIMEZONE } from "./timezone";

type RuleRow = { weekday: number; start_time: string; end_time: string; active: boolean };
type ExceptionRow = { date: string; kind: "blackout" | "extra"; start_time: string | null; end_time: string | null };

/**
 * Open future slots in UTC — the caller renders them in the visitor's browser time zone.
 *
 * The window is **≥2h out** (or ≥1h for a slot freed by a cancellation) and no later than the
 * Monday-stepped 4-week horizon (`system/02-POLICIES.md` §2). Excluding taken instants here is a
 * display convenience, not the source of truth — `book_session`'s advisory lock plus the partial
 * unique index is what actually prevents a double-book (AT-BOOK-002), and it re-checks the window
 * itself so a stale picker cannot slip a slot through.
 *
 * Every read is service-role. Which instants are taken must be visible across every buyer to
 * compute "open", but `bookings` RLS scopes select to the owning account (AT-SEC-001) — a buyer
 * must not see whose slot it is, only that it's gone. The other three tables are readable by any
 * signed-in user and carry no per-account scoping, so reading them the same way loses nothing and
 * lets the marketing page compute the identical schedule with no session at all. Only `starts_at`
 * is selected from `bookings`; nothing account-identifying leaves this function.
 */
async function openSlots(): Promise<OpenSlot[]> {
  const admin = createAdminClient();
  const [{ data: ruleRows }, { data: exceptionRows }, { data: bookingRows }, { data: releasedRows }] =
    await Promise.all([
      admin.from("availability_rules").select("weekday, start_time, end_time, active"),
      admin.from("availability_exceptions").select("date, kind, start_time, end_time"),
      admin.from("bookings").select("starts_at").neq("status", "cancelled"),
      admin.from("released_slots").select("starts_at"),
    ]);
  const takenInstants = new Set((bookingRows ?? []).map((b) => new Date(b.starts_at).getTime()));
  // Slots someone else gave back. They keep a shorter floor, so they can still appear inside the
  // ordinary 2-hour cutoff (INV-BOOK-3).
  const released = new Set((releasedRows ?? []).map((r) => new Date(r.starts_at).getTime()));

  const rules: AvailabilityRule[] = ((ruleRows ?? []) as RuleRow[]).map((r) => ({
    weekday: r.weekday,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    active: r.active,
  }));
  const exceptions: AvailabilityException[] = ((exceptionRows ?? []) as ExceptionRow[]).map((e) => ({
    date: e.date,
    kind: e.kind,
    startTime: e.start_time ? e.start_time.slice(0, 5) : null,
    endTime: e.end_time ? e.end_time.slice(0, 5) : null,
  }));

  const now = new Date();
  const to = horizonEnd(now);
  const slots = generateSlots(rules, exceptions, { from: now, to, timeZone: TUTOR_TIMEZONE });

  return slots
    .filter(
      (s) =>
        isBookable(s, now, { released: released.has(s.getTime()) }) && !takenInstants.has(s.getTime()),
    )
    .map((s) => ({ iso: s.toISOString(), released: released.has(s.getTime()) }));
}

/** The schedule for a signed-in buyer, on the surfaces that can act on it. */
export async function getOpenAvailability(): Promise<OpenSlot[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return openSlots();
}

/**
 * The same schedule, for the marketing page, where there is no session to read it with.
 *
 * What this publishes is when the tutor is free — business hours minus what's taken. It carries no
 * buyer, student, or booking identity, so it says nothing about who is on the other side of a
 * filled hour (`system/05-SURFACES.md` §1).
 */
export async function getPublicAvailability(): Promise<OpenSlot[]> {
  return openSlots();
}
