import { assessmentKindFor } from "@/lib/accounts/purposes";

/**
 * What a student is asked for before a session, derived from that booking's purpose.
 *
 * This is the executable form of the table in `system/02-POLICIES.md` §7, and it is pure on
 * purpose: the branching that shapes the whole product should be testable without a database.
 *
 * Two rules encoded here that are easy to get wrong by "completing the pattern":
 *   - **`school` purposes get no assessment at all** — not a shorter one. The goal is already
 *     known, so a pre-test tells the tutor nothing (ADR-005, carried forward by ADR-007).
 *   - **A repeat session never re-sits a diagnostic.** It is taken once per test or class level,
 *     not once per session.
 */

export type PreSessionField = "topic" | "classes" | "notes" | "uploads";

export type PreSessionShape = {
  /** Which assessment to serve, if any, and only when this is the first for that test or level. */
  assessment: "test_prep" | "math_diagnostic" | null;
  fields: PreSessionField[];
  /** Heading and blurb shown to the student, in their language. */
  title: string;
  blurb: string;
  topicLabel: string | null;
};

export function preSessionShape(input: {
  purpose: string | null;
  subPurpose: string | null;
  /** True when this student has already sat the assessment this purpose would ask for. */
  assessmentAlreadyTaken?: boolean;
  /** True when no diagnostic has been authored yet for this test or class level (AT-PRE-7). */
  assessmentUnavailable?: boolean;
}): PreSessionShape {
  const { purpose, subPurpose } = input;

  const kind = purpose ? assessmentKindFor(purpose) : null;
  // A missing diagnostic degrades to the descriptive questions and never blocks the session.
  const assessment =
    kind && !input.assessmentAlreadyTaken && !input.assessmentUnavailable ? kind : null;

  if (purpose === "test_prep") {
    return {
      assessment,
      fields: ["notes", "uploads"],
      title: assessment ? "Start with a short diagnostic" : "Tell us where you're at",
      blurb: assessment
        ? "It tells your tutor which areas to spend the hour on. There's no grade and nothing to revise for."
        : "What have you been practising, and what feels shakiest? Upload anything you've been working from.",
      topicLabel: null,
    };
  }

  if (purpose === "math_diagnostic") {
    return {
      assessment,
      // The diagnostic covers everything up to the student's current level, so it needs both
      // classes before it can be selected (F6).
      fields: assessment ? ["classes", "notes"] : ["classes", "notes", "uploads"],
      title: "Which math are you taking?",
      blurb: assessment
        ? "We'll use this to pick questions that cover what you've learned so far."
        : "Tell us where you're at and what's been hardest, and your tutor will work from that.",
      topicLabel: null,
    };
  }

  // Everything under `school`, split by sub-purpose. No assessment in any of them.
  const topicLabel =
    subPurpose === "test_quiz_prep"
      ? "What's the test or quiz on?"
      : subPurpose === "get_ahead" || subPurpose === "review_learned"
        ? "What are you covering in class right now?"
        : "What topic or unit do you need help with?";

  return {
    assessment: null,
    fields:
      subPurpose === "get_ahead" || subPurpose === "review_learned"
        ? ["topic", "classes", "notes", "uploads"]
        : ["topic", "notes", "uploads"],
    title: "Tell your tutor what to prepare",
    blurb:
      "The more specific you are, the more of the hour goes on what you actually need. Upload your worksheet, syllabus or practice test if you have one.",
    topicLabel,
  };
}

/** Whether enough has been filled in to call the preparation done. Never used to block a session. */
export function isPreSessionComplete(
  shape: PreSessionShape,
  values: { topic?: string | null; currentMathClass?: string | null; notes?: string | null },
): boolean {
  if (shape.fields.includes("topic") && !values.topic?.trim()) return false;
  if (shape.fields.includes("classes") && !values.currentMathClass?.trim()) return false;
  if (shape.fields.includes("notes") && !values.notes?.trim()) return false;
  return true;
}
