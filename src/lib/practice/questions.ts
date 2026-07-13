import { createPublicClient } from "@/lib/supabase/public";
import type { Choice, PublicQuestion, QuestionType } from "./types";

type QuestionRow = {
  id: string;
  lesson_slug: string;
  position: number;
  type: QuestionType;
  prompt: string;
  choices: Choice[] | null;
};

/**
 * Public, client-safe questions for a lesson, ordered by position (REQ-PRACTICE-002). Selects only
 * presentational columns via the anon client, so the answer secret is never fetched (NFR-SEC-001,
 * AT-PRACTICE-005). Returns `[]` when a lesson has no questions or the read fails, so a lesson still
 * renders (REQ-PRACTICE-001: a lesson MAY carry questions) and content pages never break on the DB.
 */
export async function getLessonQuestions(lessonSlug: string): Promise<PublicQuestion[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("questions")
    .select("id, lesson_slug, position, type, prompt, choices")
    .eq("lesson_slug", lessonSlug)
    .order("position", { ascending: true });

  if (error || !data) return [];

  return (data as QuestionRow[]).map((row) => ({
    id: row.id,
    lessonSlug: row.lesson_slug,
    position: row.position,
    type: row.type,
    prompt: row.prompt,
    choices: row.choices,
  }));
}
