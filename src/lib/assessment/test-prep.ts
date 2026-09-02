"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkSubmission, MalformedSubmissionError } from "@/lib/practice/check";
import type { CheckAnswerResponse, InternalQuestion, PublicQuestion, QuestionType } from "@/lib/practice/types";

export type PracticeTest = { id: string; slug: string; name: string };

/** TASK-FIRST-004, contract: a test-prep buyer's goal names a test (`sat`/`act`) — this resolves it. */
export async function getPracticeTest(slug: string): Promise<PracticeTest | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("practice_tests").select("id, slug, name").eq("slug", slug).maybeSingle();
  return data;
}

type TestPrepRow = {
  id: string;
  practice_test_id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  choices: PublicQuestion["choices"];
};

/** Hand-authored, fixed set, in order — never generated from the roadmap (ADR-005). No answer secret. */
export async function getTestPrepQuestions(testSlug: string): Promise<PublicQuestion[]> {
  const test = await getPracticeTest(testSlug);
  if (!test) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("test_prep_questions")
    .select("id, practice_test_id, position, type, prompt, choices")
    .eq("practice_test_id", test.id)
    .order("position");

  return ((data ?? []) as TestPrepRow[]).map((q) => ({
    id: q.id,
    lessonSlug: testSlug,
    position: q.position,
    type: q.type,
    prompt: q.prompt,
    choices: q.choices,
  }));
}

/** Same checking contract as `checkAnswer` (practice/actions.ts) — the answer secret never leaves the server. */
export async function checkTestPrepAnswer(input: { questionId: string; submitted: string }): Promise<CheckAnswerResponse> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("test_prep_questions")
    .select("id, practice_test_id, position, type, prompt, choices, answer, tolerance, explanation")
    .eq("id", input.questionId)
    .maybeSingle();

  if (error || !data) return { ok: false, code: "not_found", message: "Question not found." };

  const question: InternalQuestion = {
    id: data.id,
    lessonSlug: data.practice_test_id,
    position: data.position,
    type: data.type,
    prompt: data.prompt,
    choices: data.choices,
    answer: data.answer,
    tolerance: data.tolerance,
    explanation: data.explanation,
  };

  try {
    const result = checkSubmission(question, input.submitted);
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof MalformedSubmissionError) return { ok: false, code: "malformed", message: e.message };
    throw e;
  }
}
