-- ============================================================
-- Migration 00032: Rename modules -> courses, cohorts -> classes
-- Also renames all FK columns, constraints, indexes, triggers,
-- RPCs, RLS policies, and enums referencing the old names.
--
-- Made idempotent: all renames wrapped in existence checks so
-- this migration is a no-op on a DB where the rename already happened.
-- ============================================================

-- ============================================================
-- 1. Rename enum: module_level -> course_level
-- ============================================================
DO $$ BEGIN
  ALTER TYPE module_level RENAME TO course_level;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

-- ============================================================
-- 2. Rename tables
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modules') THEN
    ALTER TABLE public.modules RENAME TO courses;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cohorts') THEN
    ALTER TABLE public.cohorts RENAME TO classes;
  END IF;
END $$;

-- ============================================================
-- 3. Rename FK columns across all tables
-- ============================================================

-- classes: module_id -> course_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'module_id') THEN
    ALTER TABLE public.classes RENAME COLUMN module_id TO course_id;
  END IF;
END $$;

-- enrollments: module_id -> course_id, cohort_id -> class_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'module_id') THEN
    ALTER TABLE public.enrollments RENAME COLUMN module_id TO course_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'cohort_id') THEN
    ALTER TABLE public.enrollments RENAME COLUMN cohort_id TO class_id;
  END IF;
END $$;

-- waitlist: cohort_id -> class_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'waitlist' AND column_name = 'cohort_id') THEN
    ALTER TABLE public.waitlist RENAME COLUMN cohort_id TO class_id;
  END IF;
END $$;

-- performance_logs: module_id -> course_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performance_logs' AND column_name = 'module_id') THEN
    ALTER TABLE public.performance_logs RENAME COLUMN module_id TO course_id;
  END IF;
END $$;

-- session_cancellations: module_id -> course_id, cohort_id -> class_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'session_cancellations' AND column_name = 'module_id') THEN
    ALTER TABLE public.session_cancellations RENAME COLUMN module_id TO course_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'session_cancellations' AND column_name = 'cohort_id') THEN
    ALTER TABLE public.session_cancellations RENAME COLUMN cohort_id TO class_id;
  END IF;
END $$;

-- ============================================================
-- 4. Rename constraints on courses (was modules)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.courses RENAME CONSTRAINT chk_module_dates TO chk_course_dates;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

-- Exclusion constraints can't be renamed with ALTER, drop and recreate
DO $$ BEGIN
  ALTER TABLE public.courses DROP CONSTRAINT excl_module_subject_dates;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'excl_course_subject_dates' AND conrelid = 'public.courses'::regclass
  ) THEN
    ALTER TABLE public.courses ADD CONSTRAINT excl_course_subject_dates EXCLUDE USING gist (
      subject WITH =,
      daterange(start_date, end_date, '[]') WITH &&
    );
  END IF;
END $$;

-- ============================================================
-- 5. Rename constraints on classes (was cohorts)
-- ============================================================
-- Capacity constraints keep their names (chk_capacity_*) as they don't reference module/cohort

-- ============================================================
-- 6. Rename constraints on enrollments
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.enrollments RENAME CONSTRAINT uq_student_cohort TO uq_student_class;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

-- Partial unique index: drop old, create new with renamed columns
DROP INDEX IF EXISTS uq_student_module_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_course_active
  ON public.enrollments (student_id, course_id)
  WHERE status IN ('pending', 'active');

-- ============================================================
-- 7. Rename constraints on waitlist
-- ============================================================
DROP INDEX IF EXISTS uq_waitlist_student_cohort_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_student_class_active
  ON public.waitlist (student_id, class_id)
  WHERE status IN ('waiting', 'notified');

-- ============================================================
-- 8. Rename constraints on performance_logs
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.performance_logs RENAME CONSTRAINT uq_perf_student_module_session TO uq_perf_student_course_session;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

-- ============================================================
-- 9. Rename constraints on session_cancellations
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.session_cancellations RENAME CONSTRAINT uq_student_module_session TO uq_student_course_session;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

-- ============================================================
-- 10. Rename indexes
-- ============================================================
DO $$ BEGIN
  ALTER INDEX idx_enrollments_cohort_status RENAME TO idx_enrollments_class_status;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX idx_enrollments_module RENAME TO idx_enrollments_course;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX idx_modules_subject RENAME TO idx_courses_subject;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX idx_modules_dates RENAME TO idx_courses_dates;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX idx_cohorts_module RENAME TO idx_classes_course;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX idx_waitlist_cohort_status RENAME TO idx_waitlist_class_status;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX idx_performance_student_module RENAME TO idx_performance_student_course;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

-- ============================================================
-- 11. Drop and recreate triggers on renamed tables
-- ============================================================

-- 11a. Module overlap trigger -> Course overlap trigger
DROP TRIGGER IF EXISTS trg_check_module_overlap ON public.courses;
DROP FUNCTION IF EXISTS check_module_overlap();

CREATE OR REPLACE FUNCTION check_course_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM courses
    WHERE subject = NEW.subject
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Course dates overlap with an existing course for subject %', NEW.subject;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_course_overlap ON public.courses;
CREATE TRIGGER trg_check_course_overlap
  BEFORE INSERT OR UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION check_course_overlap();

-- 11b. Re-enrollment limit trigger (references renamed tables/columns)
DROP TRIGGER IF EXISTS trg_check_reenroll_limit ON public.enrollments;
DROP FUNCTION IF EXISTS check_reenroll_limit();

CREATE OR REPLACE FUNCTION check_reenroll_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_subject subject_type;
  v_max_reenroll INTEGER;
  v_count INTEGER;
BEGIN
  SELECT m.subject, m.max_reenroll
  INTO v_subject, v_max_reenroll
  FROM courses m
  WHERE m.id = NEW.course_id;

  SELECT COUNT(*)
  INTO v_count
  FROM enrollments e
  JOIN courses m ON m.id = e.course_id
  WHERE e.student_id = NEW.student_id
    AND m.subject = v_subject
    AND e.status IN ('active', 'completed');

  IF v_count >= v_max_reenroll THEN
    RAISE EXCEPTION 'Student has reached re-enrollment limit (%) for subject %', v_max_reenroll, v_subject;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_reenroll_limit ON public.enrollments;
CREATE TRIGGER trg_check_reenroll_limit
  BEFORE INSERT ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION check_reenroll_limit();

-- 11c. Guardrail: before_module_delete -> before_course_delete
DROP TRIGGER IF EXISTS trg_before_module_delete ON public.courses;
DROP FUNCTION IF EXISTS before_module_delete();

CREATE OR REPLACE FUNCTION before_course_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM enrollments
  WHERE course_id = OLD.id
    AND status IN ('pending', 'active');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete course with % active/pending enrollment(s)', v_count;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_before_course_delete ON public.courses;
CREATE TRIGGER trg_before_course_delete
  BEFORE DELETE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION before_course_delete();

-- 11d. Guardrail: before_cohort_capacity_update -> before_class_capacity_update
DROP TRIGGER IF EXISTS trg_before_cohort_capacity_update ON public.classes;
DROP FUNCTION IF EXISTS before_cohort_capacity_update();

CREATE OR REPLACE FUNCTION before_class_capacity_update()
RETURNS TRIGGER AS $$
DECLARE
  v_active INTEGER;
BEGIN
  IF NEW.capacity < OLD.capacity THEN
    SELECT COUNT(*) INTO v_active
    FROM enrollments
    WHERE class_id = OLD.id
      AND status = 'active';

    IF NEW.capacity < v_active THEN
      RAISE EXCEPTION 'Cannot reduce capacity to % when % students are actively enrolled', NEW.capacity, v_active;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_before_class_capacity_update ON public.classes;
CREATE TRIGGER trg_before_class_capacity_update
  BEFORE UPDATE ON public.classes
  FOR EACH ROW
  WHEN (NEW.capacity IS DISTINCT FROM OLD.capacity)
  EXECUTE FUNCTION before_class_capacity_update();

-- 11e. Audit trigger for performance_logs (references course_id now)
CREATE OR REPLACE FUNCTION audit_performance_log_update()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'performance_log_updated',
    jsonb_build_object(
      'performance_log_id', OLD.id,
      'student_id', OLD.student_id,
      'course_id', OLD.course_id,
      'session_number', OLD.session_number,
      'old_attendance', OLD.attendance,
      'new_attendance', NEW.attendance,
      'old_homework', OLD.homework_completed,
      'new_homework', NEW.homework_completed,
      'old_notes', OLD.notes,
      'new_notes', NEW.notes
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 12. Recreate RPCs with renamed table/column references
-- ============================================================

-- 12a. reserve_seat (must DROP first — parameter names changed from p_cohort_id/p_module_id)
DROP FUNCTION IF EXISTS reserve_seat(UUID, UUID, UUID, TEXT, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION reserve_seat(
  p_student_id UUID,
  p_class_id UUID,
  p_course_id UUID,
  p_agreement_version TEXT,
  p_agreement_timestamp TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity INTEGER;
  v_current_count INTEGER;
  v_enrollment_id UUID;
  v_course_start DATE;
  v_max_reenroll INTEGER;
  v_reenroll_count INTEGER;
  v_class_course_id UUID;
  v_class_active BOOLEAN;
BEGIN
  -- 0. Validate agreement fields
  IF p_agreement_version IS NULL OR p_agreement_timestamp IS NULL THEN
    RAISE EXCEPTION 'Agreement must be signed before enrollment';
  END IF;

  -- 1. Lock the class row to prevent concurrent modifications
  SELECT c.capacity, c.course_id, c.active, m.start_date, m.max_reenroll
  INTO v_capacity, v_class_course_id, v_class_active, v_course_start, v_max_reenroll
  FROM classes c
  JOIN courses m ON m.id = c.course_id
  WHERE c.id = p_class_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  -- 1a. Validate class belongs to the specified course
  IF v_class_course_id != p_course_id THEN
    RAISE EXCEPTION 'Class does not belong to the specified course';
  END IF;

  -- 1b. Check class is active
  IF NOT v_class_active THEN
    RAISE EXCEPTION 'Class is not active';
  END IF;

  -- 2. Check course hasn't started
  IF v_course_start <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot enroll: course has already started';
  END IF;

  -- 3. Count active + pending enrollments
  SELECT COUNT(*)
  INTO v_current_count
  FROM enrollments
  WHERE class_id = p_class_id
    AND status IN ('pending', 'active');

  -- 4. Check capacity
  IF v_current_count >= v_capacity THEN
    RAISE EXCEPTION 'Class is full (% / %)', v_current_count, v_capacity;
  END IF;

  -- 5. Check re-enrollment limit per subject
  SELECT COUNT(*)
  INTO v_reenroll_count
  FROM enrollments e
  WHERE e.student_id = p_student_id
    AND e.course_id IN (
      SELECT id FROM courses WHERE subject = (
        SELECT subject FROM courses WHERE id = p_course_id
      )
    )
    AND e.status IN ('active', 'completed');

  IF v_reenroll_count >= v_max_reenroll THEN
    RAISE EXCEPTION 'Re-enrollment limit reached (% of % for this subject)', v_reenroll_count, v_max_reenroll;
  END IF;

  -- 6. Insert enrollment with status = 'pending'
  INSERT INTO enrollments (
    student_id, class_id, course_id,
    status, agreement_version, agreement_timestamp
  )
  VALUES (
    p_student_id, p_class_id, p_course_id,
    'pending', p_agreement_version, p_agreement_timestamp
  )
  RETURNING id INTO v_enrollment_id;

  RETURN v_enrollment_id;
END;
$$;

-- 12b. release_seat (no module/cohort column refs, but uses enrollments table)
-- Already correct from 00025, no changes needed (only references enrollment_id)

-- 12c. cancel_session
CREATE OR REPLACE FUNCTION public.cancel_session(
  p_enrollment_id UUID,
  p_session_number INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_cancelled_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_class RECORD;
  v_course RECORD;
  v_student RECORD;
  v_session_date DATE;
  v_credit_deadline TIMESTAMPTZ;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_cancellation_id UUID;
BEGIN
  v_caller := COALESCE(p_cancelled_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock enrollment row
  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  IF v_enrollment.status != 'active' THEN
    RAISE EXCEPTION 'Enrollment is not active';
  END IF;

  -- Validate session number
  IF p_session_number < 1 OR p_session_number > 8 THEN
    RAISE EXCEPTION 'Invalid session number (must be 1-8)';
  END IF;

  -- Load class + course
  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;
  SELECT * INTO v_course FROM public.courses WHERE id = v_enrollment.course_id;

  -- Load student for ownership check
  SELECT * INTO v_student FROM public.students WHERE id = v_enrollment.student_id;

  -- Authorization
  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE id = v_caller AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin
     AND v_student.user_id != v_caller
     AND v_student.parent_id != v_caller
  THEN
    RAISE EXCEPTION 'Not authorized to cancel this session';
  END IF;

  -- Compute session date
  v_session_date := public.compute_session_date(
    v_course.start_date, v_class.meeting_day, p_session_number
  );

  -- Session must be in the future
  IF v_session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot cancel a past or current-day session';
  END IF;

  -- 24-hour notice for small groups
  IF v_class.group_size_type = 'small' THEN
    IF v_session_date <= (CURRENT_DATE + INTERVAL '1 day')::DATE THEN
      RAISE EXCEPTION 'Small group sessions require at least 24 hours notice to cancel';
    END IF;
  END IF;

  -- Check for duplicate cancellation
  IF EXISTS(
    SELECT 1 FROM public.session_cancellations
    WHERE student_id = v_enrollment.student_id
      AND course_id = v_enrollment.course_id
      AND session_number = p_session_number
  ) THEN
    RAISE EXCEPTION 'This session has already been cancelled';
  END IF;

  -- Set credit deadline for small groups only
  IF v_class.group_size_type = 'small' THEN
    v_credit_deadline := v_session_date::TIMESTAMPTZ + INTERVAL '7 days';
  END IF;

  -- Insert cancellation
  INSERT INTO public.session_cancellations (
    enrollment_id, student_id, course_id, class_id,
    session_number, session_date, group_size_type,
    reason, cancelled_by, status, credit_deadline
  ) VALUES (
    p_enrollment_id, v_enrollment.student_id, v_enrollment.course_id, v_enrollment.class_id,
    p_session_number, v_session_date, v_class.group_size_type,
    p_reason, v_caller, 'cancelled', v_credit_deadline
  ) RETURNING id INTO v_cancellation_id;

  -- Log to admin_logs
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'session_cancelled',
    jsonb_build_object(
      'cancellation_id', v_cancellation_id,
      'enrollment_id', p_enrollment_id,
      'student_id', v_enrollment.student_id,
      'course_id', v_enrollment.course_id,
      'session_number', p_session_number,
      'session_date', v_session_date,
      'group_size_type', v_class.group_size_type
    )
  );

  RETURN v_cancellation_id;
END;
$$;

-- 12d. compute_session_date -- no table refs, no changes needed

-- 12e. cleanup_stale_pending -- no module/cohort column refs, no changes needed

-- ============================================================
-- 13. Rename RLS policies
-- ============================================================

-- Courses (was modules)
DROP POLICY IF EXISTS modules_select ON public.courses;
DROP POLICY IF EXISTS modules_admin_write ON public.courses;

DROP POLICY IF EXISTS courses_select ON public.courses;
CREATE POLICY courses_select ON public.courses
  FOR SELECT USING (true);

DROP POLICY IF EXISTS courses_admin_write ON public.courses;
CREATE POLICY courses_admin_write ON public.courses
  FOR ALL USING (is_admin());

-- Classes (was cohorts)
DROP POLICY IF EXISTS cohorts_select ON public.classes;
DROP POLICY IF EXISTS cohorts_admin_write ON public.classes;

DROP POLICY IF EXISTS classes_select ON public.classes;
CREATE POLICY classes_select ON public.classes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS classes_admin_write ON public.classes;
CREATE POLICY classes_admin_write ON public.classes
  FOR ALL USING (is_admin());

-- ============================================================
-- 14. Create backward-compat views for Stripe metadata
-- (Stripe metadata may still have cohort_id/module_id from
--  sessions created before the rename)
-- ============================================================
-- No DB views needed -- handled in TypeScript webhook code

-- ============================================================
-- Done!
-- ============================================================
