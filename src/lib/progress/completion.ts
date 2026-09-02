/**
 * A lesson is complete only when every one of its questions has at least one correct attempt
 * (spec/14 §16, AT-PROGRESS-002) — one wrong-only question leaves it incomplete. Pure so it's
 * testable without a database; `markLessonProgress` supplies the ids from Postgres.
 */
export function isLessonComplete(questionIds: string[], correctlyAnsweredIds: Set<string>): boolean {
  return questionIds.length > 0 && questionIds.every((id) => correctlyAnsweredIds.has(id));
}
