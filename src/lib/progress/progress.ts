"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveProfileId } from "@/lib/accounts/active-profile";
import { isLessonComplete } from "./completion";
import type { ProfileProgress } from "./types";

/**
 * TASK-PROGRESS-001. Records one attempt against the caller's **active profile**, entirely from
 * server-side session state — no client-supplied `profileId` (the active-profile cookie was
 * already ownership-checked when set, `active-profile.ts#setActiveProfile`). A no-op when signed
 * out or no active profile, which is what keeps anonymous practice working (ADR-004). Called from
 * `checkAnswer`; failures are swallowed so a progress-write hiccup never breaks answer checking.
 */
export async function recordAttempt(questionId: string, isCorrect: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const profileId = await getActiveProfileId();
  if (!profileId) return;

  await supabase.from("question_attempts").insert({
    profile_id: profileId,
    question_id: questionId,
    is_correct: isCorrect,
  });
}

export type MarkProgressResult = { ok: true; completed: boolean } | { ok: false; message: string };

/**
 * A lesson is complete only when every one of its questions has at least one correct attempt from
 * this profile (spec/14 §16, AT-PROGRESS-002) — computed here, server-side, not trusted from the
 * client. RLS (`lesson_progress_upsert_own`/`_update_own`) is the actual ownership boundary.
 */
export async function markLessonProgress(profileId: string, lessonSlug: string): Promise<MarkProgressResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in required." };

  const { data: questions, error: qError } = await supabase
    .from("questions")
    .select("id")
    .eq("lesson_slug", lessonSlug);
  if (qError || !questions || questions.length === 0) {
    return { ok: false, message: "Lesson has no questions." };
  }

  const { data: attempts, error: aError } = await supabase
    .from("question_attempts")
    .select("question_id")
    .eq("profile_id", profileId)
    .eq("is_correct", true)
    .in("question_id", questions.map((q) => q.id));
  if (aError) return { ok: false, message: "Could not read attempts." };

  const correctIds = new Set((attempts ?? []).map((a) => a.question_id));
  const completed = isLessonComplete(questions.map((q) => q.id), correctIds);

  const { error: upsertError } = await supabase
    .from("lesson_progress")
    .upsert(
      { profile_id: profileId, lesson_slug: lessonSlug, completed_at: completed ? new Date().toISOString() : null },
      { onConflict: "profile_id,lesson_slug" },
    );
  if (upsertError) return { ok: false, message: "Could not update progress." };

  return { ok: true, completed };
}

/**
 * Client-facing wrapper: resolves the active profile server-side (same trust boundary as
 * `recordAttempt`) rather than trusting a `profileId` from the browser. A no-op, not an error, when
 * signed out or no active profile — the client calls this optimistically after every correct
 * answer and doesn't need to know whether progress-saving even applies.
 */
export async function markActiveProfileLessonProgress(lessonSlug: string): Promise<void> {
  const profileId = await getActiveProfileId();
  if (!profileId) return;
  await markLessonProgress(profileId, lessonSlug);
}

/** RLS-scoped to profiles the caller owns (contract 08, `getProfileProgress`). */
export async function getProfileProgress(profileId: string): Promise<ProfileProgress> {
  const supabase = await createClient();

  const [{ data: attempts }, { data: progress }] = await Promise.all([
    supabase
      .from("question_attempts")
      .select("question_id, is_correct, submitted_at")
      .eq("profile_id", profileId),
    supabase
      .from("lesson_progress")
      .select("lesson_slug")
      .eq("profile_id", profileId)
      .not("completed_at", "is", null),
  ]);

  return {
    attempts: (attempts ?? []).map((a) => ({
      questionId: a.question_id,
      isCorrect: a.is_correct,
      submittedAt: a.submitted_at,
    })),
    completedLessons: (progress ?? []).map((p) => p.lesson_slug),
  };
}
