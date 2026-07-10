# enroll-pages — `/enroll/*` page tree

## Purpose

The user-facing surface for enrollment: browsing classes, picking slots, joining a waitlist, accepting a waitlist offer, and seeing success / cancel feedback. Forms post to server actions in [enrollment-actions](enrollment-actions.md).

## Inputs / outputs / side effects

- **Inputs:** authenticated user (`role IN ('parent','student')`); query params (`?waitlisted=`, `?error=`, `?session_id=`, `?pay_later=`, `?test_mode=`, `?conflicts=`, `?deadline=`).
- **Reads:** `classes` (active only), `enrollments` (counts via admin client to bypass RLS), `students`, `waitlist`.
- **Writes:** none directly — all mutations happen in the server actions the forms post to.
- **Side effect:** `/enroll/[classId]` dynamically fetches slot candidates and shows seat counts.

## File paths

- `src/app/(dashboard)/enroll/page.tsx` — class browser landing
- `src/app/(dashboard)/enroll/_components/class-browser.tsx`
- `src/app/(dashboard)/enroll/_components/weekly-calendar-grid.tsx`
- `src/app/(dashboard)/enroll/[classId]/page.tsx` — slot picker
- `src/app/(dashboard)/enroll/[classId]/enroll-form.tsx`
- `src/app/(dashboard)/enroll/[classId]/waitlist-form.tsx`
- `src/app/(dashboard)/enroll/[classId]/sg-waitlist-form.tsx`
- `src/app/(dashboard)/enroll/success/page.tsx`
- `src/app/(dashboard)/enroll/cancel/page.tsx`
- `src/app/(dashboard)/enroll/waitlist-offer/[waitlistId]/page.tsx`
- `src/app/(dashboard)/enroll/waitlist-offer/[waitlistId]/accept-form.tsx`

## Journeys that use it

- [enroll](../journeys/enroll.md)
