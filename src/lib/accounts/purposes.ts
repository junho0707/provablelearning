/**
 * What a learner is here for. Its own leaf module, deliberately: `types.ts` pulls in the roadmap
 * (and with it `node:fs`), so a client component importing these *values* from there would drag
 * the filesystem into the browser bundle.
 *
 * Same vocabulary as `purchases.goal` — the First Session goal is the single-pick version.
 */
export const LEARNER_PURPOSES = ["strengths", "test_prep", "class_help"] as const;
export type LearnerPurpose = (typeof LEARNER_PURPOSES)[number];

export const PURPOSE_LABEL: Record<LearnerPurpose, string> = {
  strengths: "Find my strengths & next steps",
  test_prep: "Prep for a test (SAT, PSAT, ACT)",
  class_help: "Help with my current class",
};
