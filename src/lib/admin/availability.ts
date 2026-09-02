"use server";

import { z } from "zod";
import { requireAdmin } from "./guard";

export type AdminResult = { ok: true } | { ok: false; message: string };

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");

const ruleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
});

/** TASK-ADMIN-001, contract `publishAvailability` (rule variant). F11. */
export async function publishAvailabilityRule(input: unknown): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid rule." };
  if (parsed.data.endTime <= parsed.data.startTime) return { ok: false, message: "End must be after start." };

  const { error } = await admin.supabase.from("availability_rules").insert({
    weekday: parsed.data.weekday,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
  });
  if (error) return { ok: false, message: "Could not create the rule." };
  return { ok: true };
}

/** TASK-ADMIN-001, contract `closeAvailability` (rule variant). Deactivates rather than deletes. */
export async function closeAvailabilityRule(ruleId: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const { error } = await admin.supabase.from("availability_rules").update({ active: false }).eq("id", ruleId);
  if (error) return { ok: false, message: "Could not close the rule." };
  return { ok: true };
}

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  kind: z.enum(["blackout", "extra"]),
  startTime: timeSchema.nullable(),
  endTime: timeSchema.nullable(),
});

/** TASK-ADMIN-001, contract `publishAvailability`/`closeAvailability` (exception variant). */
export async function addAvailabilityException(input: unknown): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid exception." };
  if (parsed.data.kind === "extra" && (!parsed.data.startTime || !parsed.data.endTime)) {
    return { ok: false, message: "An extra slot needs both a start and end time." };
  }

  const { error } = await admin.supabase.from("availability_exceptions").insert({
    date: parsed.data.date,
    kind: parsed.data.kind,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
  });
  if (error) return { ok: false, message: "Could not create the exception." };
  return { ok: true };
}

export type AdminRule = { id: string; weekday: number; startTime: string; endTime: string; active: boolean };
export type AdminException = { id: string; date: string; kind: "blackout" | "extra"; startTime: string | null; endTime: string | null };

export async function listAllAvailability(): Promise<{ rules: AdminRule[]; exceptions: AdminException[] }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { rules: [], exceptions: [] };

  const [{ data: ruleRows }, { data: exceptionRows }] = await Promise.all([
    admin.supabase.from("availability_rules").select("id, weekday, start_time, end_time, active").order("weekday"),
    admin.supabase.from("availability_exceptions").select("id, date, kind, start_time, end_time").order("date"),
  ]);

  return {
    rules: (ruleRows ?? []).map((r) => ({ id: r.id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time, active: r.active })),
    exceptions: (exceptionRows ?? []).map((e) => ({ id: e.id, date: e.date, kind: e.kind, startTime: e.start_time, endTime: e.end_time })),
  };
}
