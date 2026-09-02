/**
 * What a session is for. Drives pre-session capture and post-session shape
 * (`system/02-POLICIES.md` §7) — this is the vocabulary the whole product branches on.
 *
 * Its own leaf module, deliberately: `types.ts` pulls in the roadmap (and with it `node:fs`), so a
 * client component importing these *values* from there would drag the filesystem into the browser
 * bundle.
 *
 * Free text is permitted everywhere a purpose is stored. Presets are suggestions, not a closed set
 * (ADR-007) — hence no database CHECK constraint and `labelFor`'s fallback.
 */

export const PURPOSES = ["test_prep", "school", "math_diagnostic"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABEL: Record<Purpose, string> = {
  test_prep: "Test prep",
  school: "School math help",
  math_diagnostic: "Find my gaps",
};

/** Sub-purposes per purpose. `math_diagnostic` has none — the purpose *is* the whole answer. */
export const SUB_PURPOSES = {
  test_prep: ["psat", "sat", "act"],
  school: ["help_understanding", "get_ahead", "review_learned", "test_quiz_prep"],
  math_diagnostic: [],
} as const satisfies Record<Purpose, readonly string[]>;

export type SubPurpose = (typeof SUB_PURPOSES)[Purpose][number];

export const SUB_PURPOSE_LABEL: Record<string, string> = {
  psat: "PSAT",
  sat: "SAT",
  act: "ACT",
  help_understanding: "Help understanding a topic",
  get_ahead: "Getting ahead",
  review_learned: "Reviewing what we've covered",
  test_quiz_prep: "Prepping for a test or quiz",
};

/**
 * Whether this purpose asks the student to sit an assessment before the session, and which kind.
 * `school` never does — the goal is already known, so a pre-test tells the tutor nothing
 * (ADR-005, carried forward by ADR-007).
 */
export function assessmentKindFor(purpose: string): "test_prep" | "math_diagnostic" | null {
  if (purpose === "test_prep") return "test_prep";
  if (purpose === "math_diagnostic") return "math_diagnostic";
  return null;
}

export function isPurpose(value: string): value is Purpose {
  return (PURPOSES as readonly string[]).includes(value);
}

/** A sub-purpose must belong to its purpose; free text is allowed for anything not listed. */
export function validSubPurpose(purpose: string, sub: string | null | undefined): boolean {
  if (!sub) return purpose !== "test_prep"; // test prep must name which test
  if (!isPurpose(purpose)) return true;
  const known = SUB_PURPOSES[purpose] as readonly string[];
  return known.length === 0 ? true : known.includes(sub) || sub.trim().length > 0;
}

/** Display text for a stored value, falling back to the raw string when a buyer typed their own. */
export function labelFor(value: string | null | undefined): string {
  if (!value) return "";
  if (isPurpose(value)) return PURPOSE_LABEL[value];
  return SUB_PURPOSE_LABEL[value] ?? value;
}

/** Preset choices offered on a student's profile, in the buyer's language. */
export const PROFILE_PURPOSE_PRESETS = [
  { value: "school", label: "Keep up with school math" },
  { value: "test_quiz_prep", label: "Prep for tests and quizzes" },
  { value: "get_ahead", label: "Get ahead of the class" },
  { value: "sat", label: "SAT prep" },
  { value: "psat", label: "PSAT prep" },
  { value: "act", label: "ACT prep" },
  { value: "math_diagnostic", label: "Find and fill gaps" },
  { value: "help_understanding", label: "Really understand the concepts" },
] as const;
