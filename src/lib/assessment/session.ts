"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roadmapNode } from "@/lib/content/roadmap";
import { checkSubmission, MalformedSubmissionError } from "@/lib/practice/check";
import { nextProbe, probesFor, type ProbeRecord } from "./probe";
import type { InternalQuestion, PublicQuestion, QuestionType } from "@/lib/practice/types";

function getPrereqs(nodeId: string): string[] {
  return roadmapNode(nodeId)?.prereqs ?? [];
}

/** Gets or creates the one assessment for a First Session purchase (`assessments_one_per_purchase`). */
export async function getOrCreateAssessment(
  purchaseId: string,
  profileId: string,
  mode: "strengths" | "test_prep",
  testSlug: string | null,
): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase.from("assessments").select("id").eq("purchase_id", purchaseId).maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("assessments")
    .insert({ purchase_id: purchaseId, profile_id: profileId, mode, test_slug: testSlug })
    .select("id")
    .single();
  if (error || !data) return null;
  return data;
}

export type StrengthsProbe =
  | { done: false; assessmentId: string; nodeId: string; depth: number; question: PublicQuestion }
  | { done: true; floorNodeIds: string[] };

type QuestionRow = { id: string; position: number; type: QuestionType; prompt: string; choices: PublicQuestion["choices"] };

/**
 * TASK-FIRST-003 wired to real data: replays `assessment_items` through the pure `nextProbe`
 * engine to find the next node to ask about, then picks that node's first authored question.
 * Nodes with no authored question yet are recorded as an automatic pass (`probesFor(depth)` solid
 * records) and skipped — the roadmap is only partly authored (~5% of the K–12 arc, HANDOFF.md §5),
 * so most probes would otherwise dead-end. Bounded by the same cap as the engine itself, since
 * every skip still writes to `assessment_items`.
 */
export async function getNextStrengthsProbe(assessmentId: string): Promise<StrengthsProbe | null> {
  const supabase = await createClient();

  const { data: assessment } = await supabase.from("assessments").select("id, profile_id, mode").eq("id", assessmentId).maybeSingle();
  if (!assessment || assessment.mode !== "strengths") return null;

  const { data: profile } = await supabase.from("learner_profiles").select("current_course_node").eq("id", assessment.profile_id).maybeSingle();
  const currentNodeId = profile?.current_course_node;
  if (!currentNodeId) return null;

  const admin = createAdminClient();

  // Guards a content-authoring gap from ever looping forever: each pass either asks a real
  // question or advances the engine's history, and the engine itself is cap-bounded.
  for (let guard = 0; guard < 100; guard++) {
    const { data: itemRows } = await supabase.from("assessment_items").select("is_correct").eq("assessment_id", assessmentId).order("created_at");
    const history: ProbeRecord[] = (itemRows ?? []).map((r) => ({ nodeId: "", isCorrect: r.is_correct }));

    const result = nextProbe(history, currentNodeId, getPrereqs);
    if (result.done) {
      await supabase.from("assessments").update({ completed_at: new Date().toISOString() }).eq("id", assessmentId);
      return { done: true, floorNodeIds: result.floorNodeIds };
    }

    const { data: question } = await admin
      .from("questions")
      .select("id, position, type, prompt, choices")
      .eq("lesson_slug", result.nodeId)
      .order("position")
      .limit(1)
      .maybeSingle<QuestionRow>();

    if (question) {
      return {
        done: false,
        assessmentId,
        nodeId: result.nodeId,
        depth: result.depth,
        question: { id: question.id, lessonSlug: result.nodeId, position: question.position, type: question.type, prompt: question.prompt, choices: question.choices },
      };
    }

    // No authored content for this node — auto-pass it and let the engine move on.
    const skipRows = Array.from({ length: probesFor(result.depth) }, () => ({
      assessment_id: assessmentId,
      question_id: crypto.randomUUID(),
      node_id: result.nodeId,
      is_correct: true,
      depth: result.depth,
    }));
    await supabase.from("assessment_items").insert(skipRows);
  }
  return null;
}

/** `test_prep` has no correctness-driven completion (it's a fixed set, not a probe walk) — the buyer marks it done. */
export async function completeTestPrepAssessment(assessmentId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("assessments").update({ completed_at: new Date().toISOString() }).eq("id", assessmentId);
  return { ok: !error };
}

export type RecordProbeResult = { ok: true; isCorrect: boolean; explanation: string } | { ok: false; message: string };

export async function recordStrengthsAnswer(input: {
  assessmentId: string;
  nodeId: string;
  depth: number;
  questionId: string;
  submitted: string;
}): Promise<RecordProbeResult> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data } = await admin
    .from("questions")
    .select("id, lesson_slug, position, type, prompt, choices, answer, tolerance, explanation")
    .eq("id", input.questionId)
    .maybeSingle();
  if (!data) return { ok: false, message: "Question not found." };

  const question: InternalQuestion = {
    id: data.id,
    lessonSlug: data.lesson_slug,
    position: data.position,
    type: data.type,
    prompt: data.prompt,
    choices: data.choices,
    answer: data.answer,
    tolerance: data.tolerance,
    explanation: data.explanation,
  };

  let result;
  try {
    result = checkSubmission(question, input.submitted);
  } catch (e) {
    if (e instanceof MalformedSubmissionError) return { ok: false, message: e.message };
    throw e;
  }

  await supabase.from("assessment_items").insert({
    assessment_id: input.assessmentId,
    question_id: input.questionId,
    node_id: input.nodeId,
    is_correct: result.isCorrect === true,
    depth: input.depth,
  });

  return { ok: true, isCorrect: result.isCorrect === true, explanation: result.explanation };
}
