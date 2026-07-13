import { z } from "zod";

export type QuestionType = "mcq" | "numeric" | "free";

/** A multiple-choice option as shown to the learner. */
export type Choice = { id: string; label: string };

/**
 * The client-safe view of a Question: presentational fields only. The correct `answer`,
 * `tolerance`, and `explanation` are deliberately absent — they never leave the server
 * (AT-PRACTICE-005). Produced by `getLessonQuestions`.
 */
export type PublicQuestion = {
  id: string;
  lessonSlug: string;
  position: number;
  type: QuestionType;
  prompt: string;
  choices: Choice[] | null;
};

/**
 * The full server-side Question, including the auto-check secret. Only trusted server code
 * (checkAnswer, via the service-role key) ever holds this.
 */
export type InternalQuestion = PublicQuestion & {
  answer: string | null;
  tolerance: number | null;
  explanation: string;
};

/** Result of checking a submission: `isCorrect === null` means a free-response reveal (not graded). */
export type CheckResult = { isCorrect: boolean | null; explanation: string };

/** Discriminated result returned by the checkAnswer server action. */
export type CheckAnswerResponse =
  | ({ ok: true } & CheckResult)
  | { ok: false; code: "not_found" | "malformed"; message: string };

/** Input contract for the checkAnswer server action (validated at the boundary). */
export const checkAnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  submitted: z.string(),
});
export type CheckAnswerInput = z.infer<typeof checkAnswerInputSchema>;
