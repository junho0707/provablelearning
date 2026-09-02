"use server";

import { z } from "zod";
import { requireAdmin } from "./guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeClassLevel } from "@/lib/assessment/class-level";
import type { AdminResult } from "./availability";
import type { InternalQuestion, QuestionType } from "@/lib/practice/types";

/**
 * Authoring diagnostics (R7, AT-OPS-5). Writes go through the service role for the same reason
 * `questions.ts` does: `test_prep_questions` withholds `answer` from `authenticated` by column
 * grant (migration 0012), and that wall should not be punched through with an admin policy.
 * `requireAdmin` is the gate.
 *
 * Authoring a diagnostic is data entry, and *not* authoring one is a supported state — nothing
 * here is required before launch.
 */

export type DiagnosticSummary = {
  id: string;
  slug: string;
  name: string;
  kind: "test_prep" | "math_diagnostic";
  classLevel: string | null;
  publishedAt: string | null;
  questionCount: number;
};

export async function listDiagnostics(): Promise<DiagnosticSummary[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const supabase = createAdminClient();
  const [{ data: tests }, { data: questions }] = await Promise.all([
    supabase.from("practice_tests").select("id, slug, name, kind, class_level, published_at").order("kind").order("slug"),
    supabase.from("test_prep_questions").select("practice_test_id"),
  ]);

  const counts = new Map<string, number>();
  for (const q of questions ?? []) {
    const key = q.practice_test_id as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (tests ?? []).map((t) => ({
    id: t.id as string,
    slug: t.slug as string,
    name: t.name as string,
    kind: t.kind as "test_prep" | "math_diagnostic",
    classLevel: (t.class_level as string | null) ?? null,
    publishedAt: (t.published_at as string | null) ?? null,
    questionCount: counts.get(t.id as string) ?? 0,
  }));
}

export async function getDiagnosticQuestionsForAdmin(diagnosticId: string): Promise<InternalQuestion[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const { data } = await createAdminClient()
    .from("test_prep_questions")
    .select("id, practice_test_id, position, type, prompt, choices, answer, tolerance, explanation")
    .eq("practice_test_id", diagnosticId)
    .order("position");

  return (data ?? []).map((q) => ({
    id: q.id as string,
    lessonSlug: q.practice_test_id as string,
    position: q.position as number,
    type: q.type as QuestionType,
    prompt: q.prompt as string,
    choices: q.choices as InternalQuestion["choices"],
    answer: (q.answer as string | null) ?? null,
    tolerance: (q.tolerance as number | null) ?? null,
    explanation: q.explanation as string,
  }));
}

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["test_prep", "math_diagnostic"]),
    /** For test prep, the sub-purpose it is looked up by: `psat` | `sat` | `act`. */
    slug: z.string().trim().max(60).optional(),
    /** For a math diagnostic, the class it covers up to — normalized before it is stored. */
    classLevel: z.string().trim().max(100).optional(),
  })
  .refine((v) => (v.kind === "math_diagnostic" ? Boolean(v.classLevel) : Boolean(v.slug)), {
    message: "A test-prep set needs a test slug; a math diagnostic needs a class level.",
  });

export async function createDiagnostic(input: unknown): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Name it, and say which test or class level it covers." };

  const classLevel =
    parsed.data.kind === "math_diagnostic" ? normalizeClassLevel(parsed.data.classLevel) : null;
  if (parsed.data.kind === "math_diagnostic" && !classLevel) {
    return { ok: false, message: "That class level doesn't contain anything to match on." };
  }

  const { error } = await createAdminClient().from("practice_tests").insert({
    // A math diagnostic still needs a unique slug; deriving it from the level keeps the two in
    // step and makes the row legible in the database.
    slug: parsed.data.kind === "math_diagnostic" ? `level-${classLevel}` : parsed.data.slug,
    name: parsed.data.name,
    kind: parsed.data.kind,
    class_level: classLevel,
  });
  if (error) return { ok: false, message: "There's already a diagnostic for that test or level." };
  return { ok: true };
}

const questionSchema = z.object({
  diagnosticId: z.string().uuid(),
  type: z.enum(["mcq", "numeric", "free"]),
  prompt: z.string().trim().min(1).max(4000),
  /** One option per line for an MCQ. Ids are positional (`a`, `b`, …) so the answer is typeable. */
  choices: z.string().max(2000).optional(),
  answer: z.string().trim().max(500).optional(),
  tolerance: z.number().min(0).optional().nullable(),
  explanation: z.string().trim().min(1).max(4000),
});

const CHOICE_IDS = "abcdefgh";

export async function addDiagnosticQuestion(input: unknown): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Every question needs a prompt and an explanation." };

  const options = (parsed.data.choices ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (parsed.data.type === "mcq" && options.length < 2) {
    return { ok: false, message: "A multiple-choice question needs at least two options." };
  }
  if (parsed.data.type !== "free" && !parsed.data.answer) {
    return { ok: false, message: "That question type needs a correct answer." };
  }
  if (parsed.data.type === "mcq" && !CHOICE_IDS.includes(parsed.data.answer!.toLowerCase())) {
    return { ok: false, message: "Give the answer as the option letter — a, b, c…" };
  }

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("test_prep_questions")
    .select("id", { count: "exact", head: true })
    .eq("practice_test_id", parsed.data.diagnosticId);

  const { error } = await supabase.from("test_prep_questions").insert({
    practice_test_id: parsed.data.diagnosticId,
    position: count ?? 0,
    type: parsed.data.type,
    prompt: parsed.data.prompt,
    choices:
      parsed.data.type === "mcq"
        ? options.map((label, index) => ({ id: CHOICE_IDS[index], label }))
        : null,
    answer: parsed.data.type === "free" ? null : (parsed.data.answer ?? "").toLowerCase(),
    tolerance: parsed.data.type === "numeric" ? (parsed.data.tolerance ?? null) : null,
    explanation: parsed.data.explanation,
  });
  if (error) return { ok: false, message: "Could not add that question." };
  return { ok: true };
}

export async function deleteDiagnosticQuestion(questionId: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };
  if (!z.string().uuid().safeParse(questionId).success) return { ok: false, message: "Invalid question." };

  const { error } = await createAdminClient().from("test_prep_questions").delete().eq("id", questionId);
  if (error) return { ok: false, message: "Could not delete that question." };
  return { ok: true };
}

/**
 * Publish or withdraw. Until it is published, students never see it — so a half-authored set is
 * safe to leave sitting there, and withdrawing one stops it being served without deleting the
 * answers students already gave.
 */
export async function setDiagnosticPublished(diagnosticId: string, published: boolean): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };
  if (!z.string().uuid().safeParse(diagnosticId).success) return { ok: false, message: "Invalid diagnostic." };

  const supabase = createAdminClient();
  if (published) {
    const { count } = await supabase
      .from("test_prep_questions")
      .select("id", { count: "exact", head: true })
      .eq("practice_test_id", diagnosticId);
    if ((count ?? 0) === 0) return { ok: false, message: "Add a question before publishing." };
  }

  const { error } = await supabase
    .from("practice_tests")
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq("id", diagnosticId);
  if (error) return { ok: false, message: "Could not change that." };
  return { ok: true };
}
