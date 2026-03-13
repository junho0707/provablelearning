-- ============================================================
-- Migration 00062: Drop Legacy Schema
-- Final phase — removes courses table, makeup_sessions table,
-- and all deprecated columns (course_id, host_course_id, makeup_session_id).
-- Only run AFTER verifying no code references remain.
-- ============================================================

-- =============================================================================
-- 1. DROP OLD TRIGGERS & FUNCTIONS (that reference courses table)
-- =============================================================================

-- Course overlap trigger
DROP TRIGGER IF EXISTS trg_check_course_overlap ON public.courses;
DROP FUNCTION IF EXISTS public.check_course_overlap();

-- Course delete guard trigger
DROP TRIGGER IF EXISTS trg_before_course_delete ON public.courses;
DROP FUNCTION IF EXISTS public.before_course_delete();

-- =============================================================================
-- 2. DROP OLD CONSTRAINTS referencing courses/makeup_sessions
-- =============================================================================

-- enrollments: old unique constraint on (student_id, course_id)
DO $$ BEGIN
  ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS uq_student_course;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Drop the old partial unique index on (student_id, class_id)
DROP INDEX IF EXISTS public.uq_student_class_active;

-- session_cancellations: old unique on (student_id, course_id, session_number)
-- Drop constraint FIRST (it depends on the index), then the index
DO $$ BEGIN
  ALTER TABLE public.session_cancellations DROP CONSTRAINT IF EXISTS uq_student_course_session;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DROP INDEX IF EXISTS public.uq_student_course_session;

-- performance_logs: old unique on (student_id, course_id, session_number)
DO $$ BEGIN
  ALTER TABLE public.performance_logs DROP CONSTRAINT IF EXISTS uq_perf_student_course_session;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DROP INDEX IF EXISTS public.uq_perf_student_course_session;

-- =============================================================================
-- 3. DROP OLD FK CONSTRAINTS before dropping columns
-- =============================================================================

-- classes.course_id FK
DO $$ BEGIN
  ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_course_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- enrollments.course_id FK
DO $$ BEGIN
  ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_course_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- session_cancellations.course_id FK
DO $$ BEGIN
  ALTER TABLE public.session_cancellations DROP CONSTRAINT IF EXISTS session_cancellations_course_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- makeup_bookings.host_course_id FK
DO $$ BEGIN
  ALTER TABLE public.makeup_bookings DROP CONSTRAINT IF EXISTS makeup_bookings_host_course_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- makeup_bookings.makeup_session_id FK
DO $$ BEGIN
  ALTER TABLE public.makeup_bookings DROP CONSTRAINT IF EXISTS makeup_bookings_makeup_session_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- makeup_waitlist.makeup_session_id FK
DO $$ BEGIN
  ALTER TABLE public.makeup_waitlist DROP CONSTRAINT IF EXISTS makeup_waitlist_makeup_session_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- performance_logs.course_id FK
DO $$ BEGIN
  ALTER TABLE public.performance_logs DROP CONSTRAINT IF EXISTS performance_logs_course_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================================================
-- 4. DROP DEPRECATED COLUMNS
-- =============================================================================

ALTER TABLE public.classes DROP COLUMN IF EXISTS course_id;

ALTER TABLE public.enrollments DROP COLUMN IF EXISTS course_id;

ALTER TABLE public.session_cancellations DROP COLUMN IF EXISTS course_id;

ALTER TABLE public.makeup_bookings DROP COLUMN IF EXISTS host_course_id;
ALTER TABLE public.makeup_bookings DROP COLUMN IF EXISTS makeup_session_id;

ALTER TABLE public.makeup_waitlist DROP COLUMN IF EXISTS makeup_session_id;

ALTER TABLE public.performance_logs DROP COLUMN IF EXISTS course_id;

-- =============================================================================
-- 5. DROP LEGACY TABLES
-- =============================================================================

-- Drop RLS policies on courses first
DROP POLICY IF EXISTS courses_select ON public.courses;
DROP POLICY IF EXISTS courses_admin_write ON public.courses;

-- Drop RLS policies on makeup_sessions
DROP POLICY IF EXISTS makeup_sessions_select ON public.makeup_sessions;
DROP POLICY IF EXISTS makeup_sessions_admin ON public.makeup_sessions;
DROP POLICY IF EXISTS makeup_sessions_admin_write ON public.makeup_sessions;

DROP TABLE IF EXISTS public.makeup_sessions CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;

-- =============================================================================
-- 6. MAKE NEW COLUMNS NOT NULL
-- =============================================================================

-- Classes must have name, subject, level after migration
ALTER TABLE public.classes ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.classes ALTER COLUMN subject SET NOT NULL;
ALTER TABLE public.classes ALTER COLUMN level SET NOT NULL;

-- =============================================================================
-- 7. NEW CONSTRAINTS
-- =============================================================================

-- Performance logs: unique on (student_id, class_id, session_number)
CREATE UNIQUE INDEX IF NOT EXISTS uq_perf_student_class_session
  ON public.performance_logs (student_id, class_id, session_number);

-- Drop old audit trigger on performance_logs that references course_id
DROP TRIGGER IF EXISTS trg_audit_perf_delete ON public.performance_logs;
DROP FUNCTION IF EXISTS public.audit_performance_delete();

-- Recreate audit trigger for performance_logs using class_id
CREATE OR REPLACE FUNCTION public.audit_performance_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), (SELECT id FROM public.users WHERE role = 'admin' LIMIT 1)),
    'performance_log_deleted',
    jsonb_build_object(
      'student_id', OLD.student_id,
      'class_id', OLD.class_id,
      'session_number', OLD.session_number
    )
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_perf_delete
  BEFORE DELETE ON public.performance_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_performance_delete();
