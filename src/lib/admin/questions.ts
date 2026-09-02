"use server";

import { z } from "zod";
import { requireAdmin } from "./guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminResult } from "./availability";
import type { InternalQuestion } from "@/lib/practice/types";

/**
 * TASK-ADMIN-001, "question CRUD". `questions` grants writes only to `service_role`
 * (migration 0002) — the answer/tolerance/explanation secrecy boundary (AT-PRACTICE-005) is a
 * column-privilege wall, not something an admin RLS policy should punch through. `requireAdmin`
 * is the actual gate here; the service-role client is just how the write physically happens.
 */
const questionSchema = z.object({
  lessonSlug: z.string().trim().min(1),
  position: z.number().int().min(0),
  type: z.enum(["mcq", "numeric", "free"]),
  prompt: z.string().trim().min(1),
  choices: z.array(z.object({ id: z.string(), label: z.string() })).nullable(),
  answer: z.string().nullable(),
  tolerance: z.number().nullable(),
  explanation: z.string().trim().min(1),
});

export async function listQuestionsForLesson(lessonSlug: string): Promise<InternalQuestion[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const { data } = await createAdminClient()
    .from("questions")
    .select("id, lesson_slug, position, type, prompt, choices, answer, tolerance, explanation")
    .eq("lesson_slug", lessonSlug)
    .order("position");
  return (data ?? []).map((q) => ({
    id: q.id,
    lessonSlug: q.lesson_slug,
    position: q.position,
    type: q.type,
    prompt: q.prompt,
    choices: q.choices,
    answer: q.answer,
    tolerance: q.tolerance,
    explanation: q.explanation,
  }));
}

export async function createQuestion(input: unknown): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid question." };

  const { error } = await createAdminClient().from("questions").insert({
    lesson_slug: parsed.data.lessonSlug,
    position: parsed.data.position,
    type: parsed.data.type,
    prompt: parsed.data.prompt,
    choices: parsed.data.choices,
    answer: parsed.data.answer,
    tolerance: parsed.data.tolerance,
    explanation: parsed.data.explanation,
  });
  if (error) return { ok: false, message: "Could not create that question." };
  return { ok: true };
}

export async function updateQuestion(questionId: string, input: unknown): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsedId = z.string().uuid().safeParse(questionId);
  const parsed = questionSchema.partial().safeParse(input);
  if (!parsedId.success || !parsed.success) return { ok: false, message: "Invalid question." };

  const { error } = await createAdminClient()
    .from("questions")
    .update({
      ...(parsed.data.lessonSlug !== undefined ? { lesson_slug: parsed.data.lessonSlug } : {}),
      ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
      ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
      ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
      ...(parsed.data.choices !== undefined ? { choices: parsed.data.choices } : {}),
      ...(parsed.data.answer !== undefined ? { answer: parsed.data.answer } : {}),
      ...(parsed.data.tolerance !== undefined ? { tolerance: parsed.data.tolerance } : {}),
      ...(parsed.data.explanation !== undefined ? { explanation: parsed.data.explanation } : {}),
    })
    .eq("id", parsedId.data);
  if (error) return { ok: false, message: "Could not update that question." };
  return { ok: true };
}

export async function deleteQuestion(questionId: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsedId = z.string().uuid().safeParse(questionId);
  if (!parsedId.success) return { ok: false, message: "Invalid question id." };

  const { error } = await createAdminClient().from("questions").delete().eq("id", parsedId.data);
  if (error) return { ok: false, message: "Could not delete that question." };
  return { ok: true };
}
