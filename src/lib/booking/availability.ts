"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSlots, isBookable, horizonEnd, type AvailabilityRule, type AvailabilityException } from "./slots";
import { TUTOR_TIMEZONE } from "./timezone";

type RuleRow = { weekday: number; start_time: string; end_time: string; active: boolean };
type ExceptionRow = { date: string; kind: "blackout" | "extra"; start_time: string | null; end_time: string | null };

/**
 * Open future slots in UTC — the client renders them in the visitor's browser time zone.
 *
 * The window is **≥6h out** (or ≥1h for a slot freed by a cancellation) and no later than the
 * Monday-stepped 4-week horizon (`system/02-POLICIES.md` §2). Excluding taken instants here is a
 * display convenience, not the source of truth — `book_session`'s advisory lock plus the partial
 * unique index is what actually prevents a double-book (AT-BOOK-002), and it re-checks the window
 * itself so a stale picker cannot slip a slot through.
 */
export async function getOpenAvailability(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Which instants are taken must be visible across every buyer to compute "open" slots, but
  // `bookings` RLS scopes select to the owning account (AT-SEC-001) — a buyer must not see whose
  // slot it is, only that it's gone. The service-role client reads just `starts_at`, nothing
  // account-identifying, so this doesn't leak anything the RLS boundary is protecting.
  const [{ data: ruleRows }, { data: exceptionRows }, { data: bookingRows }, { data: releasedRows }] =
    await Promise.all([
      supabase.from("availability_rules").select("weekday, start_time, end_time, active"),
      supabase.from("availability_exceptions").select("date, kind, start_time, end_time"),
      createAdminClient().from("bookings").select("starts_at").neq("status", "cancelled"),
      supabase.from("released_slots").select("starts_at"),
    ]);
  const takenInstants = new Set((bookingRows ?? []).map((b) => new Date(b.starts_at).getTime()));
  // Slots someone else gave back. They keep a shorter floor, so they can still appear inside the
  // ordinary 6-hour cutoff (INV-BOOK-3).
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
    .map((s) => s.toISOString());
}
