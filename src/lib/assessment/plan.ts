/**
 * TASK-FIRST-002. The written plan (spec/14 §6, REQ-FIRST-006/007) — a copy commitment ("delivered
 * within 48h"), not something the system sends on its own; this renders the content the admin
 * reviews and sends by hand. Pure so it's testable without a database (mirrors `probe.ts`).
 *
 * **Must work from session notes alone** when there's no assessment (`class_help` mode has none
 * at all, ADR-005) — every other field is optional for exactly that reason.
 */
export type PlanInput = {
  learnerName: string;
  mode: "strengths" | "test_prep" | "class_help" | null;
  testSlug?: string | null;
  /** `strengths` mode only — the gaps `nextProbe` located (`assessment_items`, depth-ordered). */
  floorNodeIds?: string[];
  /** Roadmap node id → readable title, for rendering `floorNodeIds`. */
  nodeTitles?: Record<string, string>;
  sessionNotes: string | null;
};

export function renderPlan(input: PlanInput): string {
  const sections: string[] = [`# Plan for ${input.learnerName}`];

  if (input.mode === "strengths") {
    sections.push(
      input.floorNodeIds && input.floorNodeIds.length > 0
        ? `## Where to start\n\nBased on the assessment, the best starting points are: ${input.floorNodeIds
            .map((id) => input.nodeTitles?.[id] ?? id)
            .join(", ")}.`
        : `## Where to start\n\nEverything probed came back solid — ready to work at the current class level.`,
    );
  } else if (input.mode === "test_prep") {
    const label = input.testSlug ? input.testSlug.toUpperCase() : "the test";
    sections.push(`## Test prep focus\n\nContinuing ${label} practice based on today's session.`);
  }

  sections.push(
    input.sessionNotes
      ? `## Session notes\n\n${input.sessionNotes}`
      : `## Session notes\n\n_Not added yet._`,
  );

  return sections.join("\n\n");
}
