# google-classroom — Google Classroom integration

## Purpose

Creates per-student Google Classrooms (SG and 1:1) and invites students to LG / SG / 1:1 Classrooms. Adds materials and removes students on drop / cancel.

## Behavior

- **`createClassroomCourse`** — admin creates an LG Classroom or the system creates a per-student SG / 1:1 Classroom on first enrollment. Stores `google_classroom_id` and `google_classroom_enrollment_code` on the `classes` row.
- **`inviteStudentToClassroom`** — sends a Classroom invite by email. If the student is on an external (non-Workspace) email, the API rejects the direct add and the function returns `selfJoinRequired=true`; the student then uses the enrollment code.
- **`removeStudentFromClassroom`** — used by drop, auto-unenroll, and cancel-makeup-booking paths.

## Inputs / outputs / side effects

- **Inputs:** Classroom IDs, student emails, enrollment codes.
- **Outputs:** `{ success, selfJoinRequired?, error?, courseId?, enrollmentCode?, alternateLink? }`.
- **Side effects:** Google Classroom API calls. The integration is best-effort — failure is logged, never blocks the enrollment.

## File paths

- `src/lib/google/classroom.ts`
- `src/lib/google/auth.ts` — service-account auth
- `src/lib/google/calendar.ts` — Calendar events for sessions / consultations
- `src/lib/google/drive-folders.ts` — Drive folder creation for class materials

## Journeys that use it

- [enroll](../journeys/enroll.md) — invite on enrollment activation; create per-student SG / 1:1 Classroom on first enrollment.
- (drop / auto-unenroll / cancel-makeup remove memberships; will be linked when those journeys are written)
