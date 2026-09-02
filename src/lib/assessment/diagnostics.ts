"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth/session";
import { assessmentKindFor } from "@/lib/accounts/purposes";
import { checkSubmission, MalformedSubmissionError } from "@/lib/practice/check";
import type { InternalQuestion, PublicQuestion, QuestionType } from "@/lib/practice/types";
import { normalizeClassLevel } from "./class-level";

/**
 * Finding and serving a diagnostic (R7).
 *
 * The rule this module exists to hold: **a missing diagnostic is normal.** Purposes are sold
 * before their diagnostics are authored, so every lookup here returns null rather than throwing,
 * and `preSessionShape` turns that null into the descriptive questions instead (AT-PRE-7).
 */

export type Diagnostic = { id: string; slug: string; name: string };

/**
 * The published set for one booking's purpose, or null when none has been authored yet.
 *
 * `test_prep` is keyed by which test the buyer named at booking; `math_diagnostic` by the
 * student's current class, which is why the class fields are asked for before the assessment is
 * served (AT-PRE-4). An unrecognised class simply finds nothing.
 */
export async function findDiagnostic(input: {
  kind: "test_prep" | "math_diagnostic";
  subPurpose: string | null;
  currentMathClass: string | null;
}): Promise<Diagnostic | null> {
  const supabase = createAdminClient();

  const query = supabase
    .from("practice_tests")
    .select("id, slug, name")
    .eq("kind", input.kind)
    .not("published_at", "is", null);

  if (input.kind === "test_prep") {
    if (!input.subPurpose) return null;
    const { data } = await query.eq("slug", input.subPurpose).maybeSingle();
    return (data as Diagnostic | null) ?? null;
  }

  const level = normalizeClassLevel(input.currentMathClass);
  if (!level) return null;
  const { data } = await query.eq("class_level", level).maybeSingle();
  return (data as Diagnostic | null) ?? null;
}

/** Whether this student has already sat this set, in any booking (AT-PRE-3). */
export async function hasTakenDiagnostic(profileId: string, diagnosticId: string): Promise<boolean> {
  const { count } = await createAdminClient()
    .from("diagnostic_responses")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("practice_test_id", diagnosticId);
  return (count ?? 0) > 0;
}

export type DiagnosticQuestion = PublicQuestion & {
  /** What the student already submitted for this booking, if they left partway through. */
  submitted: string | null;
};

/** The set's questions in order, with anything already answered for this booking folded in. */
export async function getDiagnosticQuestions(
  diagnosticId: string,
  bookingId: string,
): Promise<DiagnosticQuestion[]> {
  const supabase = await createClient();

  const [{ data: questions }, { data: responses }] = await Promise.all([
    supabase
      .from("test_prep_questions")
      .select("id, practice_test_id, position, type, prompt, choices")
      .eq("practice_test_id", diagnosticId)
      .order("position"),
    supabase
      .from("diagnostic_responses")
      .select("question_id, submitted")
      .eq("booking_id", bookingId),
  ]);

  const submittedByQuestion = new Map(
    (responses ?? []).map((r) => [r.question_id as string, r.submitted as string]),
  );

  return ((questions ?? []) as Array<{
    id: string;
    practice_test_id: string;
    position: number;
    type: QuestionType;
    prompt: string;
    choices: PublicQuestion["choices"];
  }>).map((q) => ({
    id: q.id,
    lessonSlug: q.practice_test_id,
    position: q.position,
    type: q.type,
    prompt: q.prompt,
    choices: q.choices,
    submitted: submittedByQuestion.get(q.id) ?? null,
  }));
}

export type DiagnosticAnswerResult =
  | { ok: true; isCorrect: boolean | null }
  | { ok: false; message: string };

/**
 * Record one answer. Unlike practice, **no explanation comes back**: this is a diagnostic, not a
 * lesson — its output is for the tutor, and revealing the worked solution mid-assessment would
 * change what the rest of it measures.
 */
export async function answerDiagnosticQuestion(input: {
  bookingId: string;
  questionId: string;
  submitted: string;
}): Promise<DiagnosticAnswerResult> {
  const parsed = z
    .object({
      bookingId: z.string().uuid(),
      questionId: z.string().uuid(),
      submitted: z.string().max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong. Reload and try again." };

  const student = await requireStudent();
  const supabase = await createClient();

  // The session must be this student's, and the question must belong to a published set — both
  // are RLS reads, so a forged id finds nothing rather than being rejected by a hand-written check.
  const { data: session } = await supabase
    .from("student_sessions")
    .select("id")
    .eq("id", parsed.data.bookingId)
    .maybeSingle();
  if (!session) return { ok: false, message: "That session isn't yours." };

  const { data: visible } = await supabase
    .from("test_prep_questions")
    .select("id, practice_test_id")
    .eq("id", parsed.data.questionId)
    .maybeSingle();
  if (!visible) return { ok: false, message: "That question isn't available." };

  const { data: secret } = await createAdminClient()
    .from("test_prep_questions")
    .select("id, practice_test_id, position, type, prompt, choices, answer, tolerance, explanation")
    .eq("id", parsed.data.questionId)
    .maybeSingle();
  if (!secret) return { ok: false, message: "That question isn't available." };

  const question: InternalQuestion = {
    id: secret.id as string,
    lessonSlug: secret.practice_test_id as string,
    position: secret.position as number,
    type: secret.type as QuestionType,
    prompt: secret.prompt as string,
    choices: secret.choices as PublicQuestion["choices"],
    answer: (secret.answer as string | null) ?? null,
    tolerance: (secret.tolerance as number | null) ?? null,
    explanation: secret.explanation as string,
  };

  let isCorrect: boolean | null;
  try {
    isCorrect = checkSubmission(question, parsed.data.submitted).isCorrect;
  } catch (e) {
    if (e instanceof MalformedSubmissionError) return { ok: false, message: e.message };
    throw e;
  }

  const { error } = await supabase.from("diagnostic_responses").upsert(
    {
      booking_id: parsed.data.bookingId,
      profile_id: student.profileId,
      practice_test_id: visible.practice_test_id as string,
      question_id: parsed.data.questionId,
      submitted: parsed.data.submitted,
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "booking_id,question_id" },
  );
  if (error) return { ok: false, message: "Couldn't save that answer." };

  return { ok: true, isCorrect };
}

export type TutorDiagnosticView =
  | { status: "none_expected" }
  /** AT-PRE-7: the tutor is told *why* there is no diagnostic, not left to guess. */
  | { status: "not_authored" }
  | { status: "not_taken" }
  | { status: "taken"; result: DiagnosticResult };

/**
 * What the tutor is shown about the diagnostic for one session (F12 step 2, AT-PRE-7).
 *
 * "No results" has three different meanings and they matter: this purpose never asks for one, no
 * one has authored the set yet, or the student didn't sit it. Collapsing them would make a gap in
 * the content look like a student who ignored their preparation.
 */
export async function getDiagnosticForTutor(bookingId: string): Promise<TutorDiagnosticView> {
  const result = await getDiagnosticResult(bookingId);
  if (result) return { status: "taken", result };

  const supabase = createAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("purpose, sub_purpose")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return { status: "none_expected" };

  const kind = booking.purpose ? assessmentKindFor(booking.purpose as string) : null;
  if (!kind) return { status: "none_expected" };

  const { data: submission } = await supabase
    .from("pre_session_submissions")
    .select("current_math_class")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const diagnostic = await findDiagnostic({
    kind,
    subPurpose: (booking.sub_purpose as string | null) ?? null,
    currentMathClass: (submission?.current_math_class as string | null) ?? null,
  });
  return diagnostic ? { status: "not_taken" } : { status: "not_authored" };
}

export type DiagnosticResult = {
  diagnosticName: string;
  correct: number;
  graded: number;
  items: Array<{ prompt: string; submitted: string; isCorrect: boolean | null }>;
};

/** What the student's diagnostic told us, for the tutor's session page (F12 step 2). */
async function getDiagnosticResult(bookingId: string): Promise<DiagnosticResult | null> {
  const supabase = createAdminClient();

  const { data: responses } = await supabase
    .from("diagnostic_responses")
    .select("submitted, is_correct, practice_test_id, test_prep_questions(prompt, position)")
    .eq("booking_id", bookingId);
  if (!responses || responses.length === 0) return null;

  const { data: test } = await supabase
    .from("practice_tests")
    .select("name")
    .eq("id", responses[0].practice_test_id as string)
    .maybeSingle();

  type QuestionJoin = { prompt: string; position: number };
  const unwrap = (value: unknown): QuestionJoin | null =>
    Array.isArray(value) ? ((value[0] as QuestionJoin) ?? null) : ((value as QuestionJoin) ?? null);

  const items = responses
    .map((r) => ({
      prompt: unwrap(r.test_prep_questions)?.prompt ?? "—",
      position: unwrap(r.test_prep_questions)?.position ?? 0,
      submitted: r.submitted as string,
      isCorrect: (r.is_correct as boolean | null) ?? null,
    }))
    .sort((a, b) => a.position - b.position);

  const graded = items.filter((i) => i.isCorrect !== null);

  return {
    diagnosticName: (test?.name as string | undefined) ?? "Diagnostic",
    correct: graded.filter((i) => i.isCorrect).length,
    graded: graded.length,
    items: items.map(({ prompt, submitted, isCorrect }) => ({ prompt, submitted, isCorrect })),
  };
}
