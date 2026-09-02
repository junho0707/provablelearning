"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSlots, isBookable, BOOKING_HORIZON_MS, type AvailabilityRule, type AvailabilityException } from "./slots";
import { TUTOR_TIMEZONE } from "./timezone";

type RuleRow = { weekday: number; start_time: string; end_time: string; active: boolean };
type ExceptionRow = { date: string; kind: "blackout" | "extra"; start_time: string | null; end_time: string | null };

/**
 * TASK-AVAIL-001/BOOK-001, contract `getOpenAvailability()`. Returns open future slots, **≥24h
 * out, ≤4 weeks ahead**, in UTC (REQ-BOOK-001) — the client renders them in the visitor's browser
 * time zone. Excludes instants with an existing non-cancelled booking, but that's a display
 * convenience for the picker, not the source of truth — `book_session`'s advisory lock + partial
 * unique index is what actually prevents a double-book (AT-BOOK-002).
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
  const [{ data: ruleRows }, { data: exceptionRows }, { data: bookingRows }] = await Promise.all([
    supabase.from("availability_rules").select("weekday, start_time, end_time, active"),
    supabase.from("availability_exceptions").select("date, kind, start_time, end_time"),
    createAdminClient().from("bookings").select("starts_at").neq("status", "cancelled"),
  ]);
  const takenInstants = new Set((bookingRows ?? []).map((b) => new Date(b.starts_at).getTime()));

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
  const to = new Date(now.getTime() + BOOKING_HORIZON_MS + 24 * 60 * 60 * 1000); // one extra day of buffer
  const slots = generateSlots(rules, exceptions, { from: now, to, timeZone: TUTOR_TIMEZONE });

  return slots
    .filter((s) => isBookable(s, now) && !takenInstants.has(s.getTime()))
    .map((s) => s.toISOString());
}
