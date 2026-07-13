"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkSubmission, MalformedSubmissionError } from "./check";
import {
  checkAnswerInputSchema,
  type CheckAnswerResponse,
  type InternalQuestion,
  type QuestionType,
} from "./types";

type FullQuestionRow = {
  id: string;
  lesson_slug: string;
  position: number;
  type: QuestionType;
  prompt: string;
  choices: InternalQuestion["choices"];
  answer: string | null;
  tolerance: number | null;
  explanation: string;
};

/**
 * Check a submitted answer and return correctness + explanation (FLOW-PRACTICE-001). The answer
 * secret is read only here, server-side, via the service-role key — never sent to the client
 * (AT-PRACTICE-005). Anonymous in M1: nothing is recorded (attempt recording is TASK-PROGRESS-001).
 *
 * Returns a discriminated result rather than throwing, so the client can render 404/422 states
 * inline (contract 08): `not_found` for an unknown question, `malformed` for invalid input
 * (e.g. non-numeric — AT-PRACTICE-003).
 */
export async function checkAnswer(input: unknown): Promise<CheckAnswerResponse> {
  const parsed = checkAnswerInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "malformed", message: "Invalid submission." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("questions")
    .select("id, lesson_slug, position, type, prompt, choices, answer, tolerance, explanation")
    .eq("id", parsed.data.questionId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: "not_found", message: "Question not found." };
  }

  const row = data as FullQuestionRow;
  const question: InternalQuestion = {
    id: row.id,
    lessonSlug: row.lesson_slug,
    position: row.position,
    type: row.type,
    prompt: row.prompt,
    choices: row.choices,
    answer: row.answer,
    tolerance: row.tolerance,
    explanation: row.explanation,
  };

  try {
    const result = checkSubmission(question, parsed.data.submitted);
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof MalformedSubmissionError) {
      return { ok: false, code: "malformed", message: e.message };
    }
    throw e;
  }
}
