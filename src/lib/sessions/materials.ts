"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStudent } from "@/lib/auth/session";
import { MATERIALS_DUE_HOURS } from "@/lib/policy";
import { answerMatches } from "./answer-check";

/**
 * Post-session materials (F8) — hand-authored by the tutor, worked through by the student on the
 * site so that `material_progress` can carry forward into the next session.
 *
 * Answer secrecy works exactly as it does for practice questions (migration 0002): the `answer`
 * column is withheld from `authenticated` by a column-level grant, so checking has to happen here,
 * server-side, through the service role. There is no client path to the answer to close.
 */

export type MaterialItemView = {
  id: string;
  position: number;
  prompt: string;
  explanation: string | null;
  answered: boolean;
  isCorrect: boolean | null;
};

export type MaterialView = {
  bookingId: string;
  summary: string | null;
  roadmap: string | null;
  explanations: string | null;
  publishedAt: string | null;
  items: MaterialItemView[];
};

export async function getMaterialForStudent(bookingId: string): Promise<MaterialView | null> {
  await requireStudent();
  const supabase = await createClient();

  // RLS shows a student only published material, so an unfinished draft simply isn't here.
  const { data: material } = await supabase
    .from("post_session_materials")
    .select("id, booking_id, summary, roadmap, explanations, published_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!material) return null;

  const [{ data: items }, { data: progress }] = await Promise.all([
    supabase
      .from("material_items")
      .select("id, position, prompt, explanation")
      .eq("material_id", material.id)
      .order("position", { ascending: true }),
    supabase.from("material_progress").select("material_item_id, is_correct"),
  ]);

  const answered = new Map(
    (progress ?? []).map((p) => [p.material_item_id as string, p.is_correct as boolean]),
  );

  return {
    bookingId: material.booking_id as string,
    summary: (material.summary as string | null) ?? null,
    roadmap: (material.roadmap as string | null) ?? null,
    explanations: (material.explanations as string | null) ?? null,
    publishedAt: (material.published_at as string | null) ?? null,
    items: (items ?? []).map((item) => ({
      id: item.id as string,
      position: item.position as number,
      prompt: item.prompt as string,
      // The explanation is only worth showing once they've had a go at it.
      explanation: answered.has(item.id as string) ? ((item.explanation as string | null) ?? null) : null,
      answered: answered.has(item.id as string),
      isCorrect: answered.get(item.id as string) ?? null,
    })),
  };
}

export type AnswerResult =
  | { ok: true; correct: boolean; explanation: string | null }
  | { ok: false; message: string };

/** Check one answer and record progress. The answer never leaves the server. */
export async function answerMaterialItem(input: {
  itemId: string;
  answer: string;
}): Promise<AnswerResult> {
  const parsed = z
    .object({ itemId: z.string().uuid(), answer: z.string().max(500) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong. Reload and try again." };

  const student = await requireStudent();
  const supabase = await createClient();

  // Confirm the item belongs to material published to this student before reading its answer.
  const { data: visible } = await supabase
    .from("material_items")
    .select("id")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  if (!visible) return { ok: false, message: "That question isn't available." };

  const { data: secret } = await createAdminClient()
    .from("material_items")
    .select("answer, explanation")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  if (!secret) return { ok: false, message: "That question isn't available." };

  const correct = answerMatches(parsed.data.answer, secret.answer as string);

  await supabase.from("material_progress").upsert(
    {
      material_item_id: parsed.data.itemId,
      profile_id: student.profileId,
      is_correct: correct,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "material_item_id,profile_id" },
  );

  return { ok: true, correct, explanation: (secret.explanation as string | null) ?? null };
}

// ---------------------------------------------------------------------------------------------
// Tutor side
// ---------------------------------------------------------------------------------------------

export type MaterialDraft = {
  id: string | null;
  summary: string;
  roadmap: string;
  explanations: string;
  publishedAt: string | null;
  items: Array<{ id: string; position: number; prompt: string; answer: string; explanation: string | null }>;
};

/** The draft for one booking, for the authoring form. Admin-only via RLS. */
export async function getMaterialDraft(bookingId: string): Promise<MaterialDraft> {
  const supabase = await createClient();
  const { data: material } = await supabase
    .from("post_session_materials")
    .select("id, summary, roadmap, explanations, published_at")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!material) {
    return { id: null, summary: "", roadmap: "", explanations: "", publishedAt: null, items: [] };
  }

  // The admin client reads the answer column, which the authoring form needs and `authenticated`
  // cannot see.
  const { data: items } = await createAdminClient()
    .from("material_items")
    .select("id, position, prompt, answer, explanation")
    .eq("material_id", material.id)
    .order("position", { ascending: true });

  return {
    id: material.id as string,
    summary: (material.summary as string | null) ?? "",
    roadmap: (material.roadmap as string | null) ?? "",
    explanations: (material.explanations as string | null) ?? "",
    publishedAt: (material.published_at as string | null) ?? null,
    items: (items ?? []).map((i) => ({
      id: i.id as string,
      position: i.position as number,
      prompt: i.prompt as string,
      answer: i.answer as string,
      explanation: (i.explanation as string | null) ?? null,
    })),
  };
}

const draftSchema = z.object({
  bookingId: z.string().uuid(),
  summary: z.string().max(8000),
  roadmap: z.string().max(8000),
  explanations: z.string().max(20000),
  items: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(2000),
        answer: z.string().trim().min(1).max(500),
        explanation: z.string().trim().max(4000).optional().nullable(),
      }),
    )
    .max(50),
  publish: z.boolean().default(false),
});

export type SaveMaterialResult = { ok: true; published: boolean } | { ok: false; message: string };

/**
 * Save (and optionally publish) the material. Items are replaced wholesale rather than diffed —
 * a tutor edits this as one document, and preserving per-item identity across a rewrite would only
 * matter if progress were already recorded, which cannot happen before publication.
 */
export async function saveMaterial(input: unknown): Promise<SaveMaterialResult> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the questions — each needs a prompt and an answer." };

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, profile_id")
    .eq("id", parsed.data.bookingId)
    .maybeSingle();
  if (!booking) return { ok: false, message: "Booking not found." };

  const { data: material, error } = await supabase
    .from("post_session_materials")
    .upsert(
      {
        booking_id: parsed.data.bookingId,
        profile_id: booking.profile_id as string,
        summary: parsed.data.summary,
        roadmap: parsed.data.roadmap,
        explanations: parsed.data.explanations,
        ...(parsed.data.publish ? { published_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "booking_id" },
    )
    .select("id, published_at")
    .single();

  if (error || !material) return { ok: false, message: "Couldn't save that." };

  await supabase.from("material_items").delete().eq("material_id", material.id);
  if (parsed.data.items.length > 0) {
    await supabase.from("material_items").insert(
      parsed.data.items.map((item, index) => ({
        material_id: material.id,
        position: index,
        prompt: item.prompt,
        answer: item.answer,
        explanation: item.explanation ?? null,
      })),
    );
  }

  return { ok: true, published: Boolean(material.published_at) };
}

export type OverdueSession = {
  bookingId: string;
  startsAt: string;
  studentName: string;
  hoursOverdue: number;
};

/**
 * Sessions that have happened but have no published material yet, oldest first. Anything past the
 * 24-hour target is overdue (F8); the rest are simply outstanding.
 */
export async function listMaterialsQueue(): Promise<{ due: OverdueSession[]; overdue: OverdueSession[] }> {
  const supabase = await createClient();
  const now = Date.now();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, starts_at, status, learner_profiles(name)")
    .in("status", ["booked", "completed"])
    .lt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  const { data: materials } = await supabase
    .from("post_session_materials")
    .select("booking_id, published_at");
  const published = new Set(
    (materials ?? []).filter((m) => m.published_at).map((m) => m.booking_id as string),
  );

  const due: OverdueSession[] = [];
  const overdue: OverdueSession[] = [];

  for (const booking of bookings ?? []) {
    if (published.has(booking.id as string)) continue;
    const profile = booking.learner_profiles as unknown as { name: string } | { name: string }[] | null;
    const studentName = Array.isArray(profile) ? (profile[0]?.name ?? "—") : (profile?.name ?? "—");

    const elapsedHours = (now - new Date(booking.starts_at as string).getTime()) / 3_600_000;
    const entry: OverdueSession = {
      bookingId: booking.id as string,
      startsAt: booking.starts_at as string,
      studentName,
      hoursOverdue: Math.max(0, Math.round(elapsedHours - MATERIALS_DUE_HOURS)),
    };
    (elapsedHours > MATERIALS_DUE_HOURS ? overdue : due).push(entry);
  }

  return { due, overdue };
}
