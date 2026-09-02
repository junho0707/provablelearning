import { describe, expect, it } from "vitest";
import { isLessonComplete } from "./completion";

// TASK-PROGRESS-001, AT-PROGRESS-002.

describe("isLessonComplete", () => {
  it("is false for a lesson with no questions (nothing to complete)", () => {
    expect(isLessonComplete([], new Set())).toBe(false);
  });

  it("is false when no questions have been answered correctly", () => {
    expect(isLessonComplete(["q1", "q2"], new Set())).toBe(false);
  });

  it("is false when only some questions are correct — one wrong leaves it incomplete", () => {
    expect(isLessonComplete(["q1", "q2"], new Set(["q1"]))).toBe(false);
  });

  it("is true only once every question has a correct attempt", () => {
    expect(isLessonComplete(["q1", "q2"], new Set(["q1", "q2"]))).toBe(true);
  });

  it("ignores correct ids for questions outside this lesson", () => {
    expect(isLessonComplete(["q1"], new Set(["q1", "q99-other-lesson"]))).toBe(true);
  });
});
