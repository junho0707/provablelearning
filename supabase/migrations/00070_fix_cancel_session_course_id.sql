-- Fix cancel_session and record_absence RPCs that still reference dropped course_id column
-- on session_cancellations and enrollments tables (dropped in 00062_drop_legacy_schema.sql).

-- =============================================================================
-- 1. cancel_session — remove course_id from INSERT
-- =============================================================================
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
  v_student RECORD;
  v_session_info RECORD;
  v_credit_deadline TIMESTAMPTZ;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_cancellation_id UUID;
  v_days_to_sunday INTEGER;
  v_max_sessions INTEGER;
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

  -- Determine max sessions
  IF v_enrollment.slot_2_class_id IS NOT NULL THEN
    v_max_sessions := 8;
  ELSE
    v_max_sessions := 4;
  END IF;

  IF p_session_number < 1 OR p_session_number > v_max_sessions THEN
    RAISE EXCEPTION 'Invalid session number (must be 1-%)', v_max_sessions;
  END IF;

  -- Get group_size_type from slot_1 class
  SELECT cl.* INTO v_class
  FROM public.classes cl
  WHERE cl.id = COALESCE(v_enrollment.slot_1_class_id, v_enrollment.class_id);

  -- Block LG cancellations
  IF v_class.group_size_type = 'large' THEN
    RAISE EXCEPTION 'Large group sessions cannot be cancelled. Watch the recording on Google Classroom.';
  END IF;

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

  -- Compute session date via helper
  SELECT ces.target_class_id, ces.session_date
  INTO v_session_info
  FROM public.compute_enrollment_session(p_enrollment_id, p_session_number) ces;

  -- Session must be in the future
  IF v_session_info.session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot cancel a past or current-day session';
  END IF;

  -- 24-hour notice for small groups
  IF v_class.group_size_type = 'small' THEN
    IF v_session_info.session_date <= (CURRENT_DATE + INTERVAL '1 day')::DATE THEN
      RAISE EXCEPTION 'Small group sessions require at least 24 hours notice to cancel';
    END IF;
  END IF;

  -- Check for duplicate cancellation (enrollment-scoped)
  IF EXISTS(
    SELECT 1 FROM public.session_cancellations
    WHERE student_id = v_enrollment.student_id
      AND enrollment_id = p_enrollment_id
      AND session_number = p_session_number
  ) THEN
    RAISE EXCEPTION 'This session has already been cancelled';
  END IF;

  -- Set credit deadline: end of week (Sunday 11:59:59 PM ET)
  IF v_class.group_size_type IN ('small', 'one_on_one') THEN
    v_days_to_sunday := (7 - EXTRACT(DOW FROM v_session_info.session_date)::INTEGER) % 7;
    v_credit_deadline := (
      (v_session_info.session_date + v_days_to_sunday * INTERVAL '1 day')
      + INTERVAL '23 hours 59 minutes 59 seconds'
    ) AT TIME ZONE 'America/New_York';
  END IF;

  -- Insert cancellation
  INSERT INTO public.session_cancellations (
    enrollment_id, student_id, class_id,
    session_number, session_date, group_size_type,
    reason, cancelled_by, status, credit_deadline
  ) VALUES (
    p_enrollment_id, v_enrollment.student_id,
    v_session_info.target_class_id,
    p_session_number, v_session_info.session_date, v_class.group_size_type,
    p_reason, v_caller, 'cancelled', v_credit_deadline
  ) RETURNING id INTO v_cancellation_id;

  -- Log
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'session_cancelled',
    jsonb_build_object(
      'cancellation_id', v_cancellation_id,
      'enrollment_id', p_enrollment_id,
      'student_id', v_enrollment.student_id,
      'class_id', v_session_info.target_class_id,
      'session_number', p_session_number,
      'session_date', v_session_info.session_date,
      'group_size_type', v_class.group_size_type
    )
  );

  RETURN v_cancellation_id;
END;
$$;

-- =============================================================================
-- 2. book_makeup_session — find host session by same-week match (not session number),
--    block booking into student's already-enrolled classes
-- =============================================================================
CREATE OR REPLACE FUNCTION public.book_makeup_session(
  p_cancellation_id UUID,
  p_host_class_id UUID,
  p_booked_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancellation RECORD;
  v_student RECORD;
  v_host_class RECORD;
  v_orig_class RECORD;
  v_enrollment RECORD;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_host_session_date DATE;
  v_host_session_number INTEGER;
  v_orig_week_start DATE;
  v_host_week_start DATE;
  v_candidate_date DATE;
  v_active_count INTEGER;
  v_makeup_count INTEGER;
  v_booking_id UUID;
  v_i INTEGER;
BEGIN
  v_caller := COALESCE(p_booked_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Lock cancellation row
  SELECT * INTO v_cancellation
  FROM public.session_cancellations
  WHERE id = p_cancellation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation not found';
  END IF;

  IF v_cancellation.status != 'cancelled' THEN
    RAISE EXCEPTION 'Cancellation is not in cancelled status';
  END IF;

  -- Block LG
  IF v_cancellation.group_size_type = 'large' THEN
    RAISE EXCEPTION 'Makeup booking not available for large group sessions';
  END IF;

  -- 2. Auth check
  SELECT * INTO v_student FROM public.students WHERE id = v_cancellation.student_id;

  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE id = v_caller AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin
     AND v_student.user_id != v_caller
     AND v_student.parent_id != v_caller
  THEN
    RAISE EXCEPTION 'Not authorized to book this makeup';
  END IF;

  -- 3. Load host class
  SELECT * INTO v_host_class
  FROM public.classes
  WHERE id = p_host_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Host class not found';
  END IF;

  IF NOT v_host_class.active THEN
    RAISE EXCEPTION 'Host class is not active';
  END IF;

  -- 4. Load original class for subject/level matching
  SELECT * INTO v_orig_class
  FROM public.classes
  WHERE id = v_cancellation.class_id;

  IF v_host_class.subject != v_orig_class.subject
     OR v_host_class.level != v_orig_class.level
     OR v_host_class.group_size_type != v_orig_class.group_size_type THEN
    RAISE EXCEPTION 'Host class must match subject, level, and group size type';
  END IF;

  -- Must be a different class
  IF v_host_class.id = v_cancellation.class_id THEN
    RAISE EXCEPTION 'Cannot book makeup in the same class';
  END IF;

  -- 4b. Block booking into a class the student is already enrolled in
  SELECT enr.* INTO v_enrollment
  FROM public.enrollments enr
  WHERE enr.id = v_cancellation.enrollment_id;

  IF v_enrollment.slot_1_class_id = p_host_class_id
     OR v_enrollment.slot_2_class_id = p_host_class_id
     OR (v_enrollment.slot_1_class_id IS NULL AND v_enrollment.class_id = p_host_class_id) THEN
    RAISE EXCEPTION 'Cannot book makeup in a class you are already enrolled in';
  END IF;

  -- 5. Find host session date by same-week match (iterate sessions 1-4)
  v_orig_week_start := v_cancellation.session_date
    - EXTRACT(DOW FROM v_cancellation.session_date)::INTEGER;

  v_host_session_date := NULL;
  v_host_session_number := NULL;

  FOR v_i IN 1..4 LOOP
    v_candidate_date := public.compute_session_date(
      COALESCE(v_host_class.class_start_date,
               v_orig_class.class_start_date),
      v_host_class.meeting_day,
      v_i
    );
    v_host_week_start := v_candidate_date
      - EXTRACT(DOW FROM v_candidate_date)::INTEGER;

    IF v_orig_week_start = v_host_week_start THEN
      v_host_session_date := v_candidate_date;
      v_host_session_number := v_i;
      EXIT;
    END IF;
  END LOOP;

  IF v_host_session_date IS NULL THEN
    RAISE EXCEPTION 'Host session must be in the same week as the cancelled session';
  END IF;

  -- 7. Must be in the future
  IF v_host_session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book a makeup for a past or current-day session';
  END IF;

  -- 8. Capacity check
  SELECT COUNT(*) INTO v_active_count
  FROM public.enrollments enr
  WHERE (enr.slot_1_class_id = p_host_class_id OR enr.slot_2_class_id = p_host_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_host_class_id))
    AND enr.status = 'active';

  SELECT COUNT(*) INTO v_makeup_count
  FROM public.makeup_bookings mb
  WHERE mb.host_class_id = p_host_class_id
    AND mb.session_number = v_host_session_number
    AND mb.status = 'booked';

  IF (v_active_count + v_makeup_count) >= v_host_class.capacity THEN
    RAISE EXCEPTION 'Host class session is full';
  END IF;

  -- 9. Insert booking
  INSERT INTO public.makeup_bookings (
    cancellation_id, student_id, host_class_id, enrollment_id,
    session_number, session_date, status
  ) VALUES (
    p_cancellation_id, v_cancellation.student_id, p_host_class_id,
    v_cancellation.enrollment_id,
    v_host_session_number, v_host_session_date, 'booked'
  ) RETURNING id INTO v_booking_id;

  -- 10. Update cancellation status
  UPDATE public.session_cancellations
  SET status = 'rescheduled'
  WHERE id = p_cancellation_id;

  -- 11. Log
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'makeup_booked',
    jsonb_build_object(
      'booking_id', v_booking_id,
      'cancellation_id', p_cancellation_id,
      'student_id', v_cancellation.student_id,
      'host_class_id', p_host_class_id,
      'session_number', v_host_session_number,
      'session_date', v_host_session_date
    )
  );

  RETURN v_booking_id;
END;
$$;

-- =============================================================================
-- 3. record_absence — remove course_id from INSERT
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_absence(
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

  IF p_session_number < 1 OR p_session_number > 8 THEN
    RAISE EXCEPTION 'Invalid session number (must be 1-8)';
  END IF;

  -- Find active enrollment for student + class (check both slot_1 and slot_2)
  SELECT enr.* INTO v_enrollment
  FROM public.enrollments enr
  WHERE enr.student_id = p_student_id
    AND (enr.slot_1_class_id = p_class_id OR enr.slot_2_class_id = p_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
    AND enr.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active enrollment found for student+class';
  END IF;

  -- Load class for group_size_type
  SELECT cls.* INTO v_class
  FROM public.classes cls
  WHERE cls.id = p_class_id;

  -- Only for small + one_on_one
  IF v_class.group_size_type NOT IN ('small', 'one_on_one') THEN
    RETURN NULL;
  END IF;

  -- Check for duplicate (enrollment-scoped)
  IF EXISTS (
    SELECT 1 FROM public.session_cancellations sc
    WHERE sc.student_id = p_student_id
      AND sc.enrollment_id = v_enrollment.id
      AND sc.session_number = p_session_number
  ) THEN
    RETURN NULL;
  END IF;

  -- Credit deadline: 7 days from session date
  v_credit_deadline := p_session_date::TIMESTAMPTZ + INTERVAL '7 days';

  -- Insert cancellation with status 'absent'
  INSERT INTO public.session_cancellations (
    enrollment_id, student_id, class_id,
    session_number, session_date, group_size_type,
    reason, cancelled_by, status, credit_deadline,
    cancelled_by_type
  ) VALUES (
    v_enrollment.id, p_student_id, p_class_id,
    p_session_number, p_session_date, v_class.group_size_type,
    'Marked absent by admin', p_admin_id, 'absent', v_credit_deadline,
    'admin_absent'
  ) RETURNING id INTO v_cancellation_id;

  -- Log
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    p_admin_id,
    'student_marked_absent',
    jsonb_build_object(
      'cancellation_id', v_cancellation_id,
      'student_id', p_student_id,
      'class_id', p_class_id,
      'enrollment_id', v_enrollment.id,
      'session_number', p_session_number,
      'session_date', p_session_date
    )
  );

  RETURN v_cancellation_id;
END;
$$;
