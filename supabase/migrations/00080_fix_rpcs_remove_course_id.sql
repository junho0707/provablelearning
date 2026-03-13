-- ============================================================
-- Migration 00080: Fix RPCs — remove course_id references
--
-- Migration 00062 dropped course_id from enrollments, classes,
-- and session_cancellations, but the RPCs in 00061 still
-- reference them. This recreates all affected functions.
-- ============================================================

-- =============================================================================
-- 1. RESERVE_SEAT — remove cl.course_id from SELECT, course_id from INSERTs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reserve_seat(
  p_student_id UUID,
  p_slot_1_class_id UUID,
  p_slot_2_class_id UUID DEFAULT NULL,
  p_agreement_version TEXT DEFAULT NULL,
  p_agreement_timestamp TIMESTAMPTZ DEFAULT NULL,
  p_pay_later BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot1 RECORD;
  v_slot2 RECORD;
  v_enrolled_1 INTEGER;
  v_enrolled_2 INTEGER;
  v_enrollment_id UUID;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Validate agreement
  IF p_agreement_version IS NULL OR p_agreement_timestamp IS NULL THEN
    RAISE EXCEPTION 'Agreement must be accepted before enrollment';
  END IF;

  -- Lock and fetch slot 1
  SELECT cl.id, cl.capacity, cl.active, cl.group_size_type, cl.meeting_day,
         cl.name, cl.subject, cl.level, cl.class_start_date, cl.class_end_date
  INTO v_slot1
  FROM classes cl
  WHERE cl.id = p_slot_1_class_id
  FOR UPDATE OF cl;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot 1 class not found';
  END IF;

  IF NOT v_slot1.active THEN
    RAISE EXCEPTION 'Slot 1 class is not active';
  END IF;

  -- LG: block enrollment after class starts
  IF v_slot1.group_size_type = 'large' THEN
    IF v_slot1.class_start_date IS NOT NULL AND v_slot1.class_start_date <= CURRENT_DATE THEN
      RAISE EXCEPTION 'Large group class has already started — enrollment is closed';
    END IF;
  END IF;

  -- Capacity check slot 1
  SELECT COUNT(*) INTO v_enrolled_1
  FROM enrollments enr
  WHERE (enr.slot_1_class_id = p_slot_1_class_id OR enr.slot_2_class_id = p_slot_1_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_slot_1_class_id))
    AND enr.status IN ('pending', 'active');

  IF v_enrolled_1 >= v_slot1.capacity THEN
    RAISE EXCEPTION 'Slot 1 class is full';
  END IF;

  -- Lock and validate slot 2 if provided
  IF p_slot_2_class_id IS NOT NULL THEN
    SELECT cl.id, cl.capacity, cl.active, cl.group_size_type, cl.meeting_day,
           cl.name, cl.subject, cl.level, cl.class_start_date, cl.class_end_date
    INTO v_slot2
    FROM classes cl
    WHERE cl.id = p_slot_2_class_id
    FOR UPDATE OF cl;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Slot 2 class not found';
    END IF;

    IF NOT v_slot2.active THEN
      RAISE EXCEPTION 'Slot 2 class is not active';
    END IF;

    -- Must be same subject+level+group_size
    IF v_slot1.subject != v_slot2.subject
       OR v_slot1.level != v_slot2.level
       OR v_slot1.group_size_type != v_slot2.group_size_type THEN
      RAISE EXCEPTION 'Both slots must have the same subject, level, and group size';
    END IF;

    -- Must be different classes
    IF p_slot_1_class_id = p_slot_2_class_id THEN
      RAISE EXCEPTION 'Slot 1 and Slot 2 must be different classes';
    END IF;

    -- Capacity check slot 2
    SELECT COUNT(*) INTO v_enrolled_2
    FROM enrollments enr
    WHERE (enr.slot_1_class_id = p_slot_2_class_id OR enr.slot_2_class_id = p_slot_2_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_slot_2_class_id))
      AND enr.status IN ('pending', 'active');

    IF v_enrolled_2 >= v_slot2.capacity THEN
      RAISE EXCEPTION 'Slot 2 class is full';
    END IF;
  END IF;

  -- Compute start/end dates
  IF v_slot1.group_size_type = 'large' THEN
    v_start_date := v_slot1.class_start_date;
    v_end_date := v_slot1.class_end_date;
  ELSE
    v_start_date := CURRENT_DATE;
    v_end_date := CURRENT_DATE + INTERVAL '1 month';
  END IF;

  IF p_pay_later THEN
    INSERT INTO enrollments (
      student_id, class_id, slot_1_class_id, slot_2_class_id,
      status, payment_status, payment_deadline,
      student_start_date, student_end_date,
      agreement_version, agreement_timestamp
    ) VALUES (
      p_student_id, p_slot_1_class_id, p_slot_1_class_id, p_slot_2_class_id,
      'active', 'unpaid', v_start_date + INTERVAL '7 days',
      v_start_date, v_end_date,
      p_agreement_version, p_agreement_timestamp
    )
    RETURNING id INTO v_enrollment_id;
  ELSE
    INSERT INTO enrollments (
      student_id, class_id, slot_1_class_id, slot_2_class_id,
      status, payment_status,
      student_start_date, student_end_date,
      agreement_version, agreement_timestamp
    ) VALUES (
      p_student_id, p_slot_1_class_id, p_slot_1_class_id, p_slot_2_class_id,
      'pending', 'paid',
      v_start_date, v_end_date,
      p_agreement_version, p_agreement_timestamp
    )
    RETURNING id INTO v_enrollment_id;
  END IF;

  RETURN v_enrollment_id;
END;
$$;

-- =============================================================================
-- 2. CANCEL_SESSION — remove course_id from INSERT into session_cancellations
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
-- 3. DROP_ENROLLMENT — remove e.course_id and courses table fallback
-- =============================================================================

CREATE OR REPLACE FUNCTION public.drop_enrollment(
  p_enrollment_id UUID,
  p_reason TEXT,
  p_dropped_by UUID,
  p_phase INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_start_date DATE;
  v_is_admin BOOLEAN;
  v_days_until_start INTEGER;
  v_days_since_start INTEGER;
  v_computed_phase INTEGER;
BEGIN
  -- Fetch enrollment with FOR UPDATE lock
  SELECT e.id, e.student_id, e.class_id, e.status, e.payment_status,
         e.slot_1_class_id, e.slot_2_class_id,
         e.student_start_date, e.student_end_date,
         s.user_id AS student_user_id, s.parent_id AS student_parent_id
  INTO v_enrollment
  FROM enrollments e
  JOIN students s ON s.id = e.student_id
  WHERE e.id = p_enrollment_id
  FOR UPDATE OF e;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  IF v_enrollment.status <> 'active' THEN
    RAISE EXCEPTION 'Enrollment is not active';
  END IF;

  -- Check authorization
  v_is_admin := EXISTS (SELECT 1 FROM users WHERE id = p_dropped_by AND role = 'admin');

  IF NOT v_is_admin THEN
    IF v_enrollment.student_user_id <> p_dropped_by
       AND v_enrollment.student_parent_id <> p_dropped_by THEN
      RAISE EXCEPTION 'Not authorized to drop this enrollment';
    END IF;

    -- Paid students cannot self-drop
    IF v_enrollment.payment_status = 'paid' THEN
      RAISE EXCEPTION 'Cannot self-drop a paid enrollment. Please schedule a refund consultation.';
    END IF;
  END IF;

  -- Determine start date: prefer student_start_date, fall back to class dates
  v_start_date := v_enrollment.student_start_date;
  IF v_start_date IS NULL THEN
    SELECT cl.class_start_date INTO v_start_date
    FROM classes cl
    WHERE cl.id = COALESCE(v_enrollment.slot_1_class_id, v_enrollment.class_id);
  END IF;

  -- Compute phase boundaries
  IF v_start_date IS NOT NULL THEN
    v_days_until_start := (v_start_date - CURRENT_DATE);
    v_days_since_start := (CURRENT_DATE - v_start_date);

    IF v_days_until_start > 14 THEN
      v_computed_phase := 1;
    ELSIF v_days_since_start <= 7 THEN
      v_computed_phase := 2;
    ELSE
      v_computed_phase := 3;
    END IF;
  ELSE
    v_computed_phase := 2;
  END IF;

  -- Server-side phase validation for non-admins
  IF NOT v_is_admin AND p_phase <> v_computed_phase THEN
    RAISE EXCEPTION 'Cannot self-drop in phase % (server computed phase %)', p_phase, v_computed_phase;
  END IF;

  -- Phase 1: clean drop
  IF p_phase = 1 THEN
    UPDATE enrollments
    SET status = 'canceled'
    WHERE id = p_enrollment_id;

  -- Phase 2: drop with class + group_size block
  ELSIF p_phase = 2 THEN
    UPDATE enrollments
    SET status = 'canceled',
        class_blocked = true,
        group_size_blocked = true
    WHERE id = p_enrollment_id;

  -- Phase 3: admin-only
  ELSIF p_phase = 3 THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Cannot self-drop in phase 3. Please schedule a refund consultation.';
    END IF;

    UPDATE enrollments
    SET status = 'canceled'
    WHERE id = p_enrollment_id;
  ELSE
    RAISE EXCEPTION 'Invalid phase: %', p_phase;
  END IF;
END;
$$;

-- =============================================================================
-- 4. AUTO_ENROLL_FROM_WAITLIST — remove cl.course_id, course_id from INSERT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_enroll_from_waitlist(p_class_id UUID)
RETURNS TABLE(student_id UUID, enrollment_id UUID, waitlist_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_class RECORD;
  v_dup_count INTEGER;
  v_conflict_count INTEGER;
  v_current_count INTEGER;
  v_enrollment_id UUID;
  v_admin_id UUID;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  -- Lock and fetch class info
  SELECT cl.id, cl.capacity, cl.active, cl.meeting_day, cl.meeting_time,
         cl.group_size_type, cl.subject, cl.level,
         cl.class_start_date, cl.class_end_date
  INTO v_class
  FROM classes cl
  WHERE cl.id = p_class_id
  FOR UPDATE OF cl;

  IF NOT FOUND OR NOT v_class.active THEN
    RETURN;
  END IF;

  -- LG: don't auto-enroll after class starts or ends
  IF v_class.group_size_type = 'large' THEN
    IF v_class.class_start_date IS NOT NULL AND v_class.class_start_date <= CURRENT_DATE THEN
      RETURN;
    END IF;
    IF v_class.class_end_date IS NOT NULL AND v_class.class_end_date < CURRENT_DATE THEN
      RETURN;
    END IF;
  END IF;

  -- Check capacity
  SELECT COUNT(*) INTO v_current_count
  FROM enrollments enr
  WHERE (enr.slot_1_class_id = p_class_id OR enr.slot_2_class_id = p_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
    AND enr.status IN ('pending', 'active');

  IF v_current_count >= v_class.capacity THEN
    RETURN;
  END IF;

  -- Loop through waiting entries in FIFO order
  FOR v_entry IN
    SELECT w.id, w.student_id, w.agreement_version, w.agreement_timestamp
    FROM waitlist w
    WHERE w.class_id = p_class_id
      AND w.status = 'waiting'
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    -- Skip entries without agreement
    IF v_entry.agreement_version IS NULL OR v_entry.agreement_timestamp IS NULL THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check: no duplicate enrollment in this class
    SELECT COUNT(*) INTO v_dup_count
    FROM enrollments enr
    WHERE enr.student_id = v_entry.student_id
      AND (enr.slot_1_class_id = p_class_id OR enr.slot_2_class_id = p_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
      AND enr.status IN ('pending', 'active');

    IF v_dup_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check: no time conflict
    SELECT COUNT(*) INTO v_conflict_count
    FROM enrollments enr
    JOIN classes c1 ON c1.id = COALESCE(enr.slot_1_class_id, enr.class_id)
    WHERE enr.student_id = v_entry.student_id
      AND enr.status IN ('pending', 'active')
      AND c1.meeting_day = v_class.meeting_day
      AND c1.meeting_time = v_class.meeting_time;

    -- Also check slot_2 for conflicts
    IF v_conflict_count = 0 THEN
      SELECT COUNT(*) INTO v_conflict_count
      FROM enrollments enr
      JOIN classes c2 ON c2.id = enr.slot_2_class_id
      WHERE enr.student_id = v_entry.student_id
        AND enr.status IN ('pending', 'active')
        AND enr.slot_2_class_id IS NOT NULL
        AND c2.meeting_day = v_class.meeting_day
        AND c2.meeting_time = v_class.meeting_time;
    END IF;

    IF v_conflict_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Compute start/end dates
    IF v_class.group_size_type = 'large' THEN
      v_start_date := v_class.class_start_date;
      v_end_date := v_class.class_end_date;
    ELSE
      v_start_date := CURRENT_DATE;
      v_end_date := CURRENT_DATE + INTERVAL '1 month';
    END IF;

    -- Create enrollment as active + unpaid
    BEGIN
      INSERT INTO enrollments (
        student_id, class_id, slot_1_class_id,
        status, payment_status, payment_deadline,
        student_start_date, student_end_date,
        agreement_version, agreement_timestamp
      ) VALUES (
        v_entry.student_id, p_class_id, p_class_id,
        'active', 'unpaid', v_start_date + INTERVAL '7 days',
        v_start_date, v_end_date,
        v_entry.agreement_version, v_entry.agreement_timestamp
      )
      RETURNING id INTO v_enrollment_id;
    EXCEPTION WHEN unique_violation THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END;

    -- Mark waitlist entry as converted
    UPDATE waitlist SET status = 'converted' WHERE id = v_entry.id;

    -- Log
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      v_admin_id,
      'waitlist_auto_enrolled',
      jsonb_build_object(
        'enrollment_id', v_enrollment_id,
        'student_id', v_entry.student_id,
        'class_id', p_class_id,
        'waitlist_id', v_entry.id
      )
    );

    student_id := v_entry.student_id;
    enrollment_id := v_enrollment_id;
    waitlist_id := v_entry.id;
    RETURN NEXT;

    -- Re-check capacity
    SELECT COUNT(*) INTO v_current_count
    FROM enrollments enr
    WHERE (enr.slot_1_class_id = p_class_id OR enr.slot_2_class_id = p_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
      AND enr.status IN ('pending', 'active');

    IF v_current_count >= v_class.capacity THEN
      EXIT;
    END IF;
  END LOOP;
END;
$$;

-- =============================================================================
-- 5. MARK_STUDENT_ABSENT — remove course_id from INSERT into session_cancellations
-- =============================================================================

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
