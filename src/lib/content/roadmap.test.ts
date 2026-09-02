import { describe, expect, it } from "vitest";
import { courses, lessonTrail } from "./roadmap";
import { getTree } from "./catalog";

// TASK-ROADMAP-002 (ADR-005): course-level nodes let a student name their current math class.

describe("courses()", () => {
  it("enumerates the nodes marked course: true", () => {
    const ids = courses().map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["algebra", "geometry", "precalculus", "calculus"]));
  });
});

/**
 * The map draws containment by nesting, so the number sets have to *be* nested in the data: a
 * natural number is a rational, and the tree has to say so rather than parking them side by side.
 */
describe("number-set containment", () => {
  it("nests the naturals inside the rationals, inside numbers", () => {
    const trail = lessonTrail("natural-numbers").map((t) => t.id);
    expect(trail).toEqual(["math", "numbers", "rationals", "natural-numbers"]);
  });
});

describe("courseId inheritance", () => {
  it("is set on the course node itself and inherited by its descendants", () => {
    const byId = new Map<string, ReturnType<typeof getTree>[number]>();
    const walk = (nodes: ReturnType<typeof getTree>) => {
      for (const n of nodes) {
        byId.set(n.id, n);
        walk(n.children);
      }
    };
    walk(getTree());

    const algebra = byId.get("algebra")!;
    expect(algebra.courseId).toBe("algebra");

    const child = byId.get("algebra-quadratics")!;
    expect(child.courseId).toBe("algebra");

    const outside = byId.get("fractions")!;
    expect(outside.courseId).toBeNull();
  });
});
