import { describe, it, expect } from "vitest";
import { checkSubmission, MalformedSubmissionError } from "./check";
import type { InternalQuestion } from "./types";

function q(overrides: Partial<InternalQuestion>): InternalQuestion {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    lessonSlug: "angles",
    position: 1,
    type: "mcq",
    prompt: "?",
    choices: null,
    answer: null,
    tolerance: null,
    explanation: "because.",
    ...overrides,
  };
}

describe("checkSubmission — MCQ (AT-PRACTICE-001, REQ-PRACTICE-003)", () => {
  const mcq = q({
    type: "mcq",
    choices: [
      { id: "a", label: "acute" },
      { id: "c", label: "obtuse" },
    ],
    answer: "c",
  });

  it("marks the correct choice correct, with explanation", () => {
    expect(checkSubmission(mcq, "c")).toEqual({ isCorrect: true, explanation: "because." });
  });

  it("marks a wrong choice incorrect, with explanation", () => {
    expect(checkSubmission(mcq, "a")).toEqual({ isCorrect: false, explanation: "because." });
  });
});

describe("checkSubmission — numeric tolerance (AT-PRACTICE-002)", () => {
  const exact = q({ type: "numeric", answer: "60", tolerance: 0 });
  const withTol = q({ type: "numeric", answer: "3.14", tolerance: 0.01 });

  it("accepts an exact match", () => {
    expect(checkSubmission(exact, "60").isCorrect).toBe(true);
    expect(checkSubmission(exact, " 60 ").isCorrect).toBe(true); // whitespace tolerated
  });

  it("rejects a value outside zero tolerance", () => {
    expect(checkSubmission(exact, "61").isCorrect).toBe(false);
  });

  it("accepts within tolerance and rejects just outside", () => {
    expect(checkSubmission(withTol, "3.15").isCorrect).toBe(true); // exactly on the boundary
    expect(checkSubmission(withTol, "3.16").isCorrect).toBe(false); // just outside
  });
});

describe("checkSubmission — numeric validation (AT-PRACTICE-003)", () => {
  const numeric = q({ type: "numeric", answer: "60", tolerance: 0 });

  it("throws MalformedSubmissionError on non-numeric input (no attempt recorded)", () => {
    expect(() => checkSubmission(numeric, "sixty")).toThrow(MalformedSubmissionError);
    expect(() => checkSubmission(numeric, "")).toThrow(MalformedSubmissionError);
  });
});

describe("checkSubmission — free response reveal (AT-PRACTICE-004, D1)", () => {
  const free = q({ type: "free", explanation: "worked solution here" });

  it("never grades; returns null correctness and reveals the solution", () => {
    expect(checkSubmission(free, "anything")).toEqual({
      isCorrect: null,
      explanation: "worked solution here",
    });
    expect(checkSubmission(free, "")).toEqual({
      isCorrect: null,
      explanation: "worked solution here",
    });
  });
});
