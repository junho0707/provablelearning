/**
 * Comparing a student's answer to the authored one, for practice questions attached to
 * post-session material.
 *
 * Pure and deliberately forgiving. These questions are hand-written by the tutor for one student
 * and are formative, not graded — marking "1/2" wrong because the answer was written "0.5" would
 * teach the student that the system is picky rather than that they are right. When in doubt this
 * accepts; the tutor sees the progress either way.
 */

/** Normalises for comparison: case, surrounding space, internal runs of space, and trailing dots. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
}

/** Parses plain numbers, simple fractions ("3/4"), and percentages. Returns null if it isn't one. */
export function parseNumeric(value: string): number | null {
  const text = normalise(value).replace(/[\s,$]/g, "");

  const percent = text.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percent) return Number(percent[1]) / 100;

  const fraction = text.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }

  const plain = text.match(/^-?\d+(?:\.\d+)?$/);
  return plain ? Number(text) : null;
}

/**
 * True when the student's answer matches. Numeric answers compare by value — so `0.5`, `1/2` and
 * `50%` are all the same answer — with a small tolerance for rounding. Everything else compares as
 * normalised text.
 */
export function answerMatches(submitted: string, expected: string): boolean {
  if (!submitted.trim()) return false;

  const submittedNumber = parseNumeric(submitted);
  const expectedNumber = parseNumeric(expected);
  if (submittedNumber !== null && expectedNumber !== null) {
    return Math.abs(submittedNumber - expectedNumber) < 1e-6;
  }

  return normalise(submitted) === normalise(expected);
}
