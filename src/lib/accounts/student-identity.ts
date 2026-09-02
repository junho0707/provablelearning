/**
 * How a student's username becomes an auth identity.
 *
 * Supabase Auth keys on email, and students have none — so one is synthesised in the reserved
 * `.invalid` TLD (RFC 2606), which is guaranteed never to resolve. `INV-AUTH-2` ("no email is ever
 * sent to a student") is therefore enforced by the address itself: there is nowhere for a message
 * to go, whatever any future code might try to send.
 *
 * Pure and dependency-free so both the buyer-side credential writer and the student-side sign-in
 * action can share it without either pulling in the other.
 */

export const STUDENT_EMAIL_DOMAIN = "students.provablelearning.invalid";

export function studentEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

export function isStudentEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`));
}
