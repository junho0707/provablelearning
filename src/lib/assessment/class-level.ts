/**
 * Math class levels are free text on both sides — the student types theirs into the pre-session
 * form, the owner types the level they authored a diagnostic for. Normalizing both to lowercase
 * alphanumerics is what makes "Algebra 1", "algebra 1" and "Algebra1" the same level.
 *
 * It is deliberately not cleverer than that. A fuzzy match would serve a Geometry student the
 * Algebra 2 diagnostic and nobody would notice; a miss just falls through to the descriptive
 * questions (AT-PRE-7), which is the safe direction to be wrong in.
 */
export function normalizeClassLevel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.length > 0 ? normalized : null;
}
