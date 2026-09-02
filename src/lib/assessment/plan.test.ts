import { describe, expect, it } from "vitest";
import { renderPlan } from "./plan";

// TASK-FIRST-002. DoD: a plan renders from real assessment results, and from session notes alone
// in the no-assessment mode.

describe("renderPlan", () => {
  it("renders from session notes alone when there is no assessment (class_help, REQ-FIRST-007)", () => {
    const plan = renderPlan({ learnerName: "Ada", mode: "class_help", sessionNotes: "Worked through quadratic word problems; solid on setup, slips on sign errors." });
    expect(plan).toContain("Ada");
    expect(plan).toContain("sign errors");
    expect(plan).not.toContain("Where to start");
  });

  it("renders from real assessment results in strengths mode", () => {
    const plan = renderPlan({
      learnerName: "Ben",
      mode: "strengths",
      floorNodeIds: ["grade4-fractions"],
      nodeTitles: { "grade4-fractions": "Grade 4 Fractions" },
      sessionNotes: null,
    });
    expect(plan).toContain("Grade 4 Fractions");
    expect(plan).toContain("Not added yet");
  });

  it("says everything was solid when the assessment found no gaps", () => {
    const plan = renderPlan({ learnerName: "Cy", mode: "strengths", floorNodeIds: [], sessionNotes: null });
    expect(plan).toContain("came back solid");
  });

  it("names the test in test_prep mode", () => {
    const plan = renderPlan({ learnerName: "Dee", mode: "test_prep", testSlug: "sat", sessionNotes: null });
    expect(plan).toContain("SAT");
  });

  it("still renders with no notes and no mode (defensive floor)", () => {
    const plan = renderPlan({ learnerName: "Eli", mode: null, sessionNotes: null });
    expect(plan).toContain("Eli");
    expect(plan).toContain("Not added yet");
  });
});
