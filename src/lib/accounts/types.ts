import { z } from "zod";
import { courses } from "@/lib/content/roadmap";

/**
 * A student. Unlike 0003's credential-less profile, this one **is** a login (ADR-007 §2) — but the
 * credentials live in `auth.users`, not here; the profile carries only the username used to find
 * them and whether consent has activated the account.
 */
export type LearnerProfile = {
  id: string;
  name: string;
  grade: string | null;
  currentCourseNode: string | null;
  currentMathClass: string | null;
  previousMathClass: string | null;
  primaryPurpose: string | null;
  secondaryPurpose: string | null;
  username: string | null;
  /** True once a payment recorded consent. Until then the student cannot sign in (INV-COPPA-1). */
  loginActive: boolean;
  hasLogin: boolean;
  createdAt: string;
};

/**
 * A username is typed by a child, so it stays short and forgiving. The pattern matches the DB
 * constraint in 0017 exactly — a mismatch would surface as an opaque Postgres error instead of a
 * usable message.
 */
export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{3,40}$/, "3-40 letters, numbers, dots, dashes or underscores.");

/**
 * Eight characters, no composition rules. A parent picks this for a child and then tells it to
 * them out loud; complexity requirements would push them toward writing it on the fridge, and the
 * account holds no money and no contact information (`system/01-ACTORS.md`).
 */
export const studentPasswordSchema = z
  .string()
  .min(8, "At least 8 characters.")
  .max(72, "At most 72 characters.");

const purposeField = z.string().trim().max(80).optional().nullable();

export const profileInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  grade: z.string().trim().max(20).optional().nullable(),
  currentCourseNode: z.string().trim().max(200).optional().nullable(),
  currentMathClass: z.string().trim().max(100).optional().nullable(),
  previousMathClass: z.string().trim().max(100).optional().nullable(),
  primaryPurpose: purposeField,
  secondaryPurpose: purposeField,
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Credentials are set separately from the rest of the profile — see `student-credentials.ts`. */
export const credentialsInputSchema = z.object({
  username: usernameSchema,
  password: studentPasswordSchema,
});
export type CredentialsInput = z.infer<typeof credentialsInputSchema>;

/** `currentCourseNode`, if set, must name a real course-level roadmap node (ADR-002). */
export function validCourseNode(id: string | null | undefined): boolean {
  if (!id) return true;
  return courses().some((c) => c.id === id);
}

export type ProfileResult =
  | { ok: true; profile: LearnerProfile }
  | { ok: false; code: "malformed" | "not_found" | "denied" | "username_taken"; message: string };
