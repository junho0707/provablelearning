import type { CheckResult, InternalQuestion } from "./types";

/** Thrown when a submission is not a valid shape for its question type (e.g. non-numeric input). */
export class MalformedSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedSubmissionError";
  }
}

/**
 * Check a submitted answer against a question, server-side. Pure and deterministic — the single
 * source of truth for correctness (REQ-PRACTICE-003):
 *
 * - `mcq`     — exact match on the chosen option id.
 * - `numeric` — normalized numeric equality within the question's absolute tolerance (default 0).
 *               Non-numeric input throws `MalformedSubmissionError` (→ 422, no attempt) per
 *               AT-PRACTICE-003.
 * - `free`    — never auto-graded: returns `isCorrect: null` and reveals the worked solution
 *               (D1 / AT-PRACTICE-004).
 */
export function checkSubmission(question: InternalQuestion, submitted: string): CheckResult {
  const explanation = question.explanation;

  switch (question.type) {
    case "free":
      return { isCorrect: null, explanation };

    case "mcq":
      return { isCorrect: submitted === question.answer, explanation };

    case "numeric": {
      const value = parseNumeric(submitted);
      const target = Number(question.answer);
      const tolerance = question.tolerance ?? 0;
      return { isCorrect: Math.abs(value - target) <= tolerance, explanation };
    }
  }
}

/** Parse learner numeric input, tolerating surrounding whitespace. Rejects anything non-numeric. */
function parseNumeric(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") throw new MalformedSubmissionError("Enter a number.");
  const value = Number(trimmed);
  if (!Number.isFinite(value)) throw new MalformedSubmissionError("That is not a valid number.");
  return value;
}
