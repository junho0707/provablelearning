-- Fix book_makeup_session: NULL session_date when both class_start_date values are NULL.
-- Root cause: compute_session_date(NULL, ...) returns NULL, and PostgreSQL NULL comparisons
-- silently skip all guard checks, letting the INSERT proceed with NULL session_date.
-- Fix: use enrollment.student_start_date as a fallback, and add explicit NULL guard.

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
  v_start_date DATE;
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

  -- 5. Determine start date: host class > original class > enrollment student_start_date
  v_start_date := COALESCE(
    v_host_class.class_start_date,
    v_orig_class.class_start_date,
    v_enrollment.student_start_date
  );

  IF v_start_date IS NULL THEN
    RAISE EXCEPTION 'Cannot compute session date: no start date available';
  END IF;

  -- 6. Find host session date by same-week match (iterate sessions 1-4)
  v_orig_week_start := v_cancellation.session_date
    - EXTRACT(DOW FROM v_cancellation.session_date)::INTEGER;

  v_host_session_date := NULL;
  v_host_session_number := NULL;

  FOR v_i IN 1..4 LOOP
    v_candidate_date := public.compute_session_date(
      v_start_date,
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
