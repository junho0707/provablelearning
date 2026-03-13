-- Migration 00088: Expand makeup booking window from same-week to entire enrollment window
--
-- Previously, makeup bookings were restricted to the same calendar week as the
-- cancelled session. Now students can book makeups for any week within their
-- enrollment period (student_start_date to student_end_date).
--
-- Changes:
-- 1. book_makeup_session: add p_session_date param, remove same-week constraint
-- 2. join_makeup_waitlist: full rewrite (was broken — referenced dropped courses table)
-- 3. Relax session_number CHECK constraints (host class may have higher session numbers)

-- =============================================================================
-- 1. Relax session_number constraints
-- =============================================================================

ALTER TABLE makeup_bookings DROP CONSTRAINT IF EXISTS makeup_bookings_session_number_check;
ALTER TABLE makeup_bookings ADD CONSTRAINT makeup_bookings_session_number_check CHECK (session_number >= 1);

ALTER TABLE makeup_waitlist DROP CONSTRAINT IF EXISTS makeup_waitlist_session_number_check;
ALTER TABLE makeup_waitlist ADD CONSTRAINT makeup_waitlist_session_number_check CHECK (session_number >= 1);

-- =============================================================================
-- 2. book_makeup_session — accept p_session_date, validate within enrollment window
-- =============================================================================

CREATE OR REPLACE FUNCTION public.book_makeup_session(
  p_cancellation_id UUID,
  p_host_class_id UUID,
  p_booked_by UUID DEFAULT NULL,
  p_session_date DATE DEFAULT NULL
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
  v_active_count INTEGER;
  v_makeup_count INTEGER;
  v_booking_id UUID;
  v_start_date DATE;
  v_first_host_date DATE;
  v_target_dow INTEGER;
  v_current_dow INTEGER;
  v_offset INTEGER;
  v_day_map JSONB := '{"Sunday":0,"Monday":1,"Tuesday":2,"Wednesday":3,"Thursday":4,"Friday":5,"Saturday":6}'::JSONB;
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

  -- 4. Load original class — only require group_size_type match
  SELECT * INTO v_orig_class
  FROM public.classes
  WHERE id = v_cancellation.class_id;

  IF v_host_class.group_size_type != v_orig_class.group_size_type THEN
    RAISE EXCEPTION 'Host class must match group size type';
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
     OR v_enrollment.slot_3_class_id = p_host_class_id
     OR (v_enrollment.slot_1_class_id IS NULL AND v_enrollment.class_id = p_host_class_id) THEN
    RAISE EXCEPTION 'Cannot book makeup in a class you are already enrolled in';
  END IF;

  -- 5. Validate p_session_date
  IF p_session_date IS NULL THEN
    RAISE EXCEPTION 'Session date is required';
  END IF;

  -- Must be in the future
  IF p_session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book a makeup for a past or current-day session';
  END IF;

  -- Must fall on the host class's meeting day
  v_target_dow := (v_day_map ->> v_host_class.meeting_day)::INTEGER;
  IF EXTRACT(DOW FROM p_session_date)::INTEGER != v_target_dow THEN
    RAISE EXCEPTION 'Session date does not fall on the host class meeting day (%)' , v_host_class.meeting_day;
  END IF;

  -- Must be within the enrollment window
  IF v_enrollment.student_end_date IS NOT NULL AND p_session_date > v_enrollment.student_end_date THEN
    RAISE EXCEPTION 'Session date is outside enrollment window';
  END IF;

  v_host_session_date := p_session_date;

  -- 6. Compute host session number from date
  v_start_date := COALESCE(
    v_host_class.class_start_date,
    v_enrollment.student_start_date
  );

  IF v_start_date IS NULL THEN
    RAISE EXCEPTION 'Cannot compute session number: no start date available';
  END IF;

  -- Find first meeting day on or after start date
  v_current_dow := EXTRACT(DOW FROM v_start_date)::INTEGER;
  v_offset := (v_target_dow - v_current_dow + 7) % 7;
  v_first_host_date := v_start_date + v_offset;

  -- Session number = weeks since first host date + 1
  v_host_session_number := ((v_host_session_date - v_first_host_date) / 7) + 1;

  IF v_host_session_number < 1 THEN
    RAISE EXCEPTION 'Session date is before the host class start';
  END IF;

  -- 7. Capacity check (include slot_3)
  SELECT COUNT(*) INTO v_active_count
  FROM public.enrollments enr
  WHERE (enr.slot_1_class_id = p_host_class_id
         OR enr.slot_2_class_id = p_host_class_id
         OR enr.slot_3_class_id = p_host_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_host_class_id))
    AND enr.status = 'active';

  SELECT COUNT(*) INTO v_makeup_count
  FROM public.makeup_bookings mb
  WHERE mb.host_class_id = p_host_class_id
    AND mb.session_date = v_host_session_date
    AND mb.status = 'booked';

  IF (v_active_count + v_makeup_count) >= v_host_class.capacity THEN
    RAISE EXCEPTION 'Host class session is full';
  END IF;

  -- 8. Insert booking
  INSERT INTO public.makeup_bookings (
    cancellation_id, student_id, host_class_id, enrollment_id,
    session_number, session_date, status
  ) VALUES (
    p_cancellation_id, v_cancellation.student_id, p_host_class_id,
    v_cancellation.enrollment_id,
    v_host_session_number, v_host_session_date, 'booked'
  ) RETURNING id INTO v_booking_id;

  -- 9. Update cancellation status
  UPDATE public.session_cancellations
  SET status = 'rescheduled'
  WHERE id = p_cancellation_id;

  -- 10. Log
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
-- 3. join_makeup_waitlist — full rewrite (remove courses ref, remove same-week)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.join_makeup_waitlist(
  p_cancellation_id UUID,
  p_host_class_id UUID,
  p_joined_by UUID,
  p_session_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancel RECORD;
  v_host_class RECORD;
  v_enrollment RECORD;
  v_session_date DATE;
  v_host_meeting_time TIME;
  v_cutoff TIMESTAMPTZ;
  v_is_owner BOOLEAN;
  v_is_parent BOOLEAN;
  v_is_admin BOOLEAN;
  v_caller_role TEXT;
  v_target_dow INTEGER;
  v_start_date DATE;
  v_current_dow INTEGER;
  v_offset INTEGER;
  v_first_host_date DATE;
  v_session_number INTEGER;
  v_result_id UUID;
  v_day_map JSONB := '{"Sunday":0,"Monday":1,"Tuesday":2,"Wednesday":3,"Thursday":4,"Friday":5,"Saturday":6}'::JSONB;
BEGIN
  -- Get caller role
  SELECT role INTO v_caller_role FROM users WHERE id = p_joined_by;
  v_is_admin := (v_caller_role = 'admin');

  -- Fetch cancellation
  SELECT sc.id, sc.student_id, sc.class_id, sc.enrollment_id,
         sc.session_number, sc.session_date, sc.group_size_type, sc.status
  INTO v_cancel
  FROM session_cancellations sc
  WHERE sc.id = p_cancellation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation not found';
  END IF;

  IF v_cancel.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancellation not in cancelled status';
  END IF;

  IF v_cancel.group_size_type = 'one_on_one' THEN
    RAISE EXCEPTION 'Waitlist not available for 1:1';
  END IF;

  -- Auth check
  SELECT EXISTS(
    SELECT 1 FROM students WHERE user_id = p_joined_by AND id = v_cancel.student_id
  ) INTO v_is_owner;

  SELECT EXISTS(
    SELECT 1 FROM students WHERE parent_id = p_joined_by AND id = v_cancel.student_id
  ) INTO v_is_parent;

  IF NOT (v_is_admin OR v_is_owner OR v_is_parent) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Fetch host class
  SELECT c.id, c.group_size_type, c.meeting_day, c.meeting_time, c.active,
         c.class_start_date
  INTO v_host_class
  FROM classes c
  WHERE c.id = p_host_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Host class not found';
  END IF;

  IF NOT v_host_class.active THEN
    RAISE EXCEPTION 'Host class is not active';
  END IF;

  -- Same group size
  IF v_host_class.group_size_type <> v_cancel.group_size_type THEN
    RAISE EXCEPTION 'Host class must be same group size';
  END IF;

  -- Different class
  IF v_host_class.id = v_cancel.class_id THEN
    RAISE EXCEPTION 'Cannot waitlist in same class';
  END IF;

  -- Get enrollment for window validation
  SELECT enr.* INTO v_enrollment
  FROM enrollments enr
  WHERE enr.id = v_cancel.enrollment_id;

  -- Validate session date
  IF p_session_date IS NULL THEN
    RAISE EXCEPTION 'Session date is required';
  END IF;

  v_session_date := p_session_date;

  -- Must fall on host class meeting day
  v_target_dow := (v_day_map ->> v_host_class.meeting_day)::INTEGER;
  IF EXTRACT(DOW FROM v_session_date)::INTEGER != v_target_dow THEN
    RAISE EXCEPTION 'Session date does not fall on host class meeting day';
  END IF;

  -- Must be within enrollment window
  IF v_enrollment.student_end_date IS NOT NULL AND v_session_date > v_enrollment.student_end_date THEN
    RAISE EXCEPTION 'Session date is outside enrollment window';
  END IF;

  -- Compute session number from date
  v_start_date := COALESCE(v_host_class.class_start_date, v_enrollment.student_start_date);
  v_current_dow := EXTRACT(DOW FROM v_start_date)::INTEGER;
  v_offset := (v_target_dow - v_current_dow + 7) % 7;
  v_first_host_date := v_start_date + v_offset;
  v_session_number := ((v_session_date - v_first_host_date) / 7) + 1;

  -- 6-hour cutoff
  v_host_meeting_time := v_host_class.meeting_time::TIME;
  v_cutoff := (v_session_date + v_host_meeting_time) - INTERVAL '6 hours';

  IF now() >= v_cutoff THEN
    RAISE EXCEPTION 'Too late to join waitlist (cutoff is 6 hours before session)';
  END IF;

  -- Insert (unique constraint prevents duplicates)
  INSERT INTO makeup_waitlist (student_id, cancellation_id, host_class_id, session_number, session_date)
  VALUES (v_cancel.student_id, p_cancellation_id, p_host_class_id, v_session_number, v_session_date)
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;
