import { z } from "zod";
import { courses } from "@/lib/content/roadmap";
import { LEARNER_PURPOSES, type LearnerPurpose } from "./purposes";

/**
 * A learner profile — name, grade, current math class (spec/14 §16). No credentials: this is not
 * a login (REQ-ACCT-002, INV-ACTOR-1).
 */
export type LearnerProfile = {
  id: string;
  name: string;
  grade: string | null;
  currentCourseNode: string | null;
  purposes: LearnerPurpose[];
  createdAt: string;
};

export const profileInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  grade: z.string().trim().max(20).optional().nullable(),
  currentCourseNode: z.string().trim().max(200).optional().nullable(),
  purposes: z.array(z.enum(LEARNER_PURPOSES)).optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

/** `currentCourseNode`, if set, must name a real course-level roadmap node (ADR-005). */
export function validCourseNode(id: string | null | undefined): boolean {
  if (!id) return true;
  return courses().some((c) => c.id === id);
}

export type ProfileResult =
  | { ok: true; profile: LearnerProfile }
  | { ok: false; code: "malformed" | "not_found" | "denied"; message: string };
