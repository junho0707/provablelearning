-- ============================================================
-- Migration 00052: Absence Tracking
-- Admin marks student absent via performance logs →
-- parent/student has 1 week to submit excuse note →
-- if excuse submitted, credit issued via existing cron;
-- if not, expired. Applies to small + one_on_one (large gets no credit).
-- ============================================================

-- 1. Add 'absent' to cancellation_status enum
ALTER TYPE cancellation_status ADD VALUE IF NOT EXISTS 'absent';

-- 2. New columns on session_cancellations
ALTER TABLE session_cancellations
  ADD COLUMN IF NOT EXISTS cancelled_by_type TEXT NOT NULL DEFAULT 'self'
    CHECK (cancelled_by_type IN ('self', 'admin_absent'));

ALTER TABLE session_cancellations
  ADD COLUMN IF NOT EXISTS excuse_note TEXT;

ALTER TABLE session_cancellations
  ADD COLUMN IF NOT EXISTS excuse_submitted_at TIMESTAMPTZ;

-- 3. RPC: mark_student_absent
-- Called from performance log action when attendance = false
CREATE OR REPLACE FUNCTION public.mark_student_absent(
  p_student_id UUID,
  p_class_id UUID,
  p_session_number INTEGER,
  p_session_date DATE,
  p_admin_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_class RECORD;
  v_cancellation_id UUID;
  v_credit_deadline TIMESTAMPTZ;
BEGIN
  -- Validate admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized: admin only';
  END IF;

  -- Validate session number
  IF p_session_number < 1 OR p_session_number > 8 THEN
    RAISE EXCEPTION 'Invalid session number (must be 1-8)';
  END IF;

  -- Look up active enrollment for student + class
  SELECT enr.* INTO v_enrollment
  FROM public.enrollments enr
  WHERE enr.student_id = p_student_id
    AND enr.class_id = p_class_id
    AND enr.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active enrollment found for student+class';
  END IF;

  -- Load class for group_size_type
  SELECT cls.* INTO v_class
  FROM public.classes cls
  WHERE cls.id = p_class_id;

  -- Only create for small + one_on_one (large gets no credit)
  IF v_class.group_size_type NOT IN ('small', 'one_on_one') THEN
    RETURN NULL;
  END IF;

  -- Check for duplicate cancellation (student + course + session_number)
  IF EXISTS (
    SELECT 1 FROM public.session_cancellations sc
    WHERE sc.student_id = p_student_id
      AND sc.course_id = v_enrollment.course_id
      AND sc.session_number = p_session_number
  ) THEN
    -- Already has a cancellation row — skip silently
    RETURN NULL;
  END IF;

  -- Credit deadline: 7 days from session date
  v_credit_deadline := p_session_date::TIMESTAMPTZ + INTERVAL '7 days';

  -- Insert cancellation with status 'absent'
  INSERT INTO public.session_cancellations (
    enrollment_id, student_id, course_id, class_id,
    session_number, session_date, group_size_type,
    reason, cancelled_by, status, credit_deadline,
    cancelled_by_type
  ) VALUES (
    v_enrollment.id, p_student_id, v_enrollment.course_id, p_class_id,
    p_session_number, p_session_date, v_class.group_size_type,
    'Marked absent by admin', p_admin_id, 'absent', v_credit_deadline,
    'admin_absent'
  ) RETURNING id INTO v_cancellation_id;

  -- Log to admin_logs
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    p_admin_id,
    'student_marked_absent',
    jsonb_build_object(
      'cancellation_id', v_cancellation_id,
      'student_id', p_student_id,
      'class_id', p_class_id,
      'course_id', v_enrollment.course_id,
      'session_number', p_session_number,
      'session_date', p_session_date,
      'group_size_type', v_class.group_size_type
    )
  );

  RETURN v_cancellation_id;
END;
$$;

-- 4. RPC: submit_excuse_note
-- Called by parent or independent student to excuse an absence
CREATE OR REPLACE FUNCTION public.submit_excuse_note(
  p_cancellation_id UUID,
  p_note TEXT,
  p_submitted_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancellation RECORD;
  v_student RECORD;
BEGIN
  -- Load cancellation
  SELECT sc.* INTO v_cancellation
  FROM public.session_cancellations sc
  WHERE sc.id = p_cancellation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation not found';
  END IF;

  -- Must be in 'absent' status
  IF v_cancellation.status != 'absent' THEN
    RAISE EXCEPTION 'Can only submit excuse for absent status';
  END IF;

  -- Must be before credit deadline
  IF v_cancellation.credit_deadline IS NULL OR v_cancellation.credit_deadline <= NOW() THEN
    RAISE EXCEPTION 'Excuse deadline has passed';
  END IF;

  -- Note must not be empty
  IF p_note IS NULL OR TRIM(p_note) = '' THEN
    RAISE EXCEPTION 'Excuse note cannot be empty';
  END IF;

  -- Auth: submitted_by must be parent_id or student's user_id
  SELECT s.* INTO v_student
  FROM public.students s
  WHERE s.id = v_cancellation.student_id;

  IF v_student.user_id != p_submitted_by
     AND v_student.parent_id != p_submitted_by
  THEN
    RAISE EXCEPTION 'Not authorized to submit excuse for this student';
  END IF;

  -- Update cancellation: excuse submitted → status becomes 'cancelled' (eligible for credit cron)
  UPDATE public.session_cancellations
  SET excuse_note = TRIM(p_note),
      excuse_submitted_at = NOW(),
      status = 'cancelled'
  WHERE id = p_cancellation_id;

  -- Log
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    p_submitted_by,
    'excuse_note_submitted',
    jsonb_build_object(
      'cancellation_id', p_cancellation_id,
      'student_id', v_cancellation.student_id,
      'session_number', v_cancellation.session_number,
      'session_date', v_cancellation.session_date
    )
  );
END;
$$;

-- 5. Partial index moved to 00053 (can't use new enum value in same transaction)
