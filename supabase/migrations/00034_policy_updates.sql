-- ============================================================
-- Migration 00034: Policy Updates
-- 1. Credit deadline = end of week (Sunday 11:59:59 PM ET)
--    instead of fixed 7d/14d intervals
-- 2. No other cancel_session logic changes (all validation intact)
-- ============================================================

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
  v_days_to_sunday INTEGER;
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

  -- Set credit deadline based on group size:
  -- small, medium, one_on_one → end of the week (Sunday 11:59:59 PM ET)
  -- large → NULL (no credit)
  IF v_class.group_size_type IN ('small', 'medium', 'one_on_one') THEN
    -- DOW: Sunday=0, Monday=1, ..., Saturday=6
    -- Days until Sunday: (7 - DOW) % 7  (Sunday itself → 0)
    v_days_to_sunday := (7 - EXTRACT(DOW FROM v_session_date)::INTEGER) % 7;
    v_credit_deadline := (
      (v_session_date + v_days_to_sunday * INTERVAL '1 day')
      + INTERVAL '23 hours 59 minutes 59 seconds'
    ) AT TIME ZONE 'America/New_York';
  END IF;
  -- large: v_credit_deadline stays NULL (no credit)

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
