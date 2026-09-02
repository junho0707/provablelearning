import { describe, it, expect } from "vitest";
import { preSessionShape, isPreSessionComplete } from "./pre-session-shape";

/**
 * The purpose → pre-session table in `system/02-POLICIES.md` §7, asserted row by row. This is the
 * branch the whole product hangs off, and it is pure, so it can be tested properly rather than
 * through the database.
 */

describe("test prep", () => {
  it("serves the test-prep diagnostic the first time", () => {
    const shape = preSessionShape({ purpose: "test_prep", subPurpose: "sat" });
    expect(shape.assessment).toBe("test_prep");
  });

  it("does not re-sit it on a repeat session", () => {
    const shape = preSessionShape({
      purpose: "test_prep",
      subPurpose: "sat",
      assessmentAlreadyTaken: true,
    });
    expect(shape.assessment).toBeNull();
  });

  it("falls back to descriptive questions when no diagnostic is authored (AT-PRE-7)", () => {
    const shape = preSessionShape({
      purpose: "test_prep",
      subPurpose: "act",
      assessmentUnavailable: true,
    });
    expect(shape.assessment).toBeNull();
    expect(shape.fields).toContain("notes");
  });
});

describe("math diagnostic", () => {
  it("asks for both classes, because the assessment covers everything up to that level", () => {
    const shape = preSessionShape({ purpose: "math_diagnostic", subPurpose: null });
    expect(shape.assessment).toBe("math_diagnostic");
    expect(shape.fields).toContain("classes");
  });

  it("still asks for the classes when no diagnostic exists yet", () => {
    const shape = preSessionShape({
      purpose: "math_diagnostic",
      subPurpose: null,
      assessmentUnavailable: true,
    });
    expect(shape.assessment).toBeNull();
    expect(shape.fields).toContain("classes");
    expect(shape.fields).toContain("uploads");
  });
});

describe("school help never has an assessment", () => {
  // Not a shorter one — none. Adding one here would be "completing the pattern" against ADR-005.
  for (const sub of ["help_understanding", "get_ahead", "review_learned", "test_quiz_prep"]) {
    it(`${sub} gets no assessment`, () => {
      expect(preSessionShape({ purpose: "school", subPurpose: sub }).assessment).toBeNull();
    });
  }

  it("asks what the test is on when prepping for one", () => {
    const shape = preSessionShape({ purpose: "school", subPurpose: "test_quiz_prep" });
    expect(shape.topicLabel).toBe("What's the test or quiz on?");
    expect(shape.fields).toEqual(["topic", "notes", "uploads"]);
  });

  it("asks for the class as well when getting ahead or reviewing", () => {
    for (const sub of ["get_ahead", "review_learned"]) {
      expect(preSessionShape({ purpose: "school", subPurpose: sub }).fields).toContain("classes");
    }
  });

  it("always accepts uploads — a worksheet is the most useful thing a student can send", () => {
    for (const sub of ["help_understanding", "get_ahead", "review_learned", "test_quiz_prep"]) {
      expect(preSessionShape({ purpose: "school", subPurpose: sub }).fields).toContain("uploads");
    }
  });
});

describe("completeness is advisory, never blocking", () => {
  it("is incomplete while a required field is blank", () => {
    const shape = preSessionShape({ purpose: "school", subPurpose: "help_understanding" });
    expect(isPreSessionComplete(shape, { topic: "", notes: "stuck on factoring" })).toBe(false);
  });

  it("is complete once the asked-for fields are filled", () => {
    const shape = preSessionShape({ purpose: "school", subPurpose: "help_understanding" });
    expect(isPreSessionComplete(shape, { topic: "Quadratics", notes: "factoring" })).toBe(true);
  });

  it("ignores fields this purpose never asked for", () => {
    const shape = preSessionShape({ purpose: "test_prep", subPurpose: "sat" });
    expect(isPreSessionComplete(shape, { notes: "geometry is shaky" })).toBe(true);
  });
});
