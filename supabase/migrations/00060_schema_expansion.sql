-- ============================================================
-- Migration 00060: Schema Expansion for Rolling Enrollment Model
-- ADDITIVE ONLY — no columns dropped, no code breakage.
--
-- 1. classes: absorb course-level fields (name, subject, level, dates)
-- 2. enrollments: dual-slot (slot_1/slot_2) + per-student dates
-- 3. session_cancellations: make course_id nullable, add enrollment-scoped unique
-- 4. makeup_bookings: add enrollment_id, make host_course_id/makeup_session_id nullable
-- 5. performance_logs: add class_id
-- 6. Drop re-enrollment trigger (references courses.max_reenroll)
-- ============================================================

-- =============================================================================
-- 1. CLASSES: Add course-absorbed fields
-- =============================================================================

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS subject subject_type,
  ADD COLUMN IF NOT EXISTS level course_level,
  ADD COLUMN IF NOT EXISTS class_start_date DATE,
  ADD COLUMN IF NOT EXISTS class_end_date DATE;

-- Backfill from courses via course_id JOIN
UPDATE public.classes cl
SET
  name    = c.name,
  subject = c.subject,
  level   = c.level,
  class_start_date = c.start_date,
  class_end_date   = c.end_date
FROM public.courses c
WHERE cl.course_id = c.id
  AND cl.name IS NULL;

-- =============================================================================
-- 2. ENROLLMENTS: Dual-slot + per-student dates
-- =============================================================================

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS slot_1_class_id UUID REFERENCES public.classes(id),
  ADD COLUMN IF NOT EXISTS slot_2_class_id UUID REFERENCES public.classes(id),
  ADD COLUMN IF NOT EXISTS student_start_date DATE,
  ADD COLUMN IF NOT EXISTS student_end_date DATE;

-- Backfill slot_1_class_id from class_id
UPDATE public.enrollments
SET slot_1_class_id = class_id
WHERE slot_1_class_id IS NULL AND class_id IS NOT NULL;

-- Backfill student dates from course dates
UPDATE public.enrollments enr
SET
  student_start_date = c.start_date,
  student_end_date   = c.end_date
FROM public.courses c
WHERE enr.course_id = c.id
  AND enr.student_start_date IS NULL;

-- Make course_id nullable (new enrollments won't have it)
ALTER TABLE public.enrollments
  ALTER COLUMN course_id DROP NOT NULL;

-- =============================================================================
-- 3. SESSION_CANCELLATIONS: Make course_id nullable, add enrollment-scoped unique
-- =============================================================================

ALTER TABLE public.session_cancellations
  ALTER COLUMN course_id DROP NOT NULL;

-- New unique index alongside the old one (student_id, course_id, session_number)
-- This one is enrollment-scoped for the new model
CREATE UNIQUE INDEX IF NOT EXISTS uq_cancel_student_enrollment_session
  ON public.session_cancellations (student_id, enrollment_id, session_number);

-- =============================================================================
-- 4. MAKEUP_BOOKINGS: Add enrollment_id
-- =============================================================================

ALTER TABLE public.makeup_bookings
  ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES public.enrollments(id);

-- Backfill enrollment_id from cancellations
UPDATE public.makeup_bookings mb
SET enrollment_id = sc.enrollment_id
FROM public.session_cancellations sc
WHERE mb.cancellation_id = sc.id
  AND mb.enrollment_id IS NULL;

-- Relax the CHECK constraint that requires exactly one of host_class_id or makeup_session_id
-- In the new model, all bookings use host_class_id (regular class slots as makeups)
-- and makeup_session_id is no longer needed
DO $$ BEGIN
  ALTER TABLE public.makeup_bookings DROP CONSTRAINT IF EXISTS chk_booking_type;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================================================
-- 5. PERFORMANCE_LOGS: Add class_id
-- =============================================================================

ALTER TABLE public.performance_logs
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id);

-- Backfill class_id from enrollments
UPDATE public.performance_logs pl
SET class_id = enr.class_id
FROM public.enrollments enr
WHERE pl.student_id = enr.student_id
  AND pl.course_id = enr.course_id
  AND pl.class_id IS NULL;

-- =============================================================================
-- 6. DROP RE-ENROLLMENT TRIGGER
-- It references courses.max_reenroll which will be removed.
-- Re-enrollment limiting moves to application layer.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_check_reenroll_limit ON public.enrollments;
DROP FUNCTION IF EXISTS public.check_reenroll_limit();

-- =============================================================================
-- 7. MAKEUP_WAITLIST: relax CHECK constraint
-- In the new model, all waitlist entries use host_class_id
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE public.makeup_waitlist DROP CONSTRAINT IF EXISTS chk_waitlist_type;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
