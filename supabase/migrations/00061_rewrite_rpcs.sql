-- ============================================================
-- Migration 00061: Rewrite RPCs for Rolling Enrollment Model
--
-- New model:
--   - classes are standalone (name, subject, level, dates)
--   - enrollments have slot_1_class_id + optional slot_2_class_id
--   - SG/1:1 = rolling (student_start_date/student_end_date)
--   - LG = fixed (class_start_date/class_end_date)
--   - No courses table references
--   - No makeup_sessions table references
--   - Makeups use regular class slots (subject+level+group_size match)
-- ============================================================

-- =============================================================================
-- 1. HELPER: compute_enrollment_session_date
-- Given an enrollment + session number, returns (class_id, session_date)
-- 2-slot: odd sessions (1,3,5,7) → slot_1, even (2,4,6,8) → slot_2
-- 1-slot: sessions 1-4 only
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_enrollment_session(
  p_enrollment_id UUID,
  p_session_number INTEGER
)
RETURNS TABLE(target_class_id UUID, session_date DATE)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_slot_class_id UUID;
  v_class RECORD;
  v_start_date DATE;
  v_slot_session_num INTEGER;
BEGIN
  SELECT e.slot_1_class_id, e.slot_2_class_id,
         e.student_start_date, e.student_end_date,
         e.class_id
  INTO v_enrollment
  FROM enrollments e
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  -- Determine which slot and slot-relative session number
  IF v_enrollment.slot_2_class_id IS NOT NULL THEN
    -- 2-slot enrollment: odd → slot_1, even → slot_2
    IF p_session_number < 1 OR p_session_number > 8 THEN
      RAISE EXCEPTION 'Invalid session number for 2-slot enrollment (must be 1-8)';
    END IF;
    IF p_session_number % 2 = 1 THEN
      v_slot_class_id := v_enrollment.slot_1_class_id;
      v_slot_session_num := (p_session_number + 1) / 2; -- 1→1, 3→2, 5→3, 7→4
    ELSE
      v_slot_class_id := v_enrollment.slot_2_class_id;
      v_slot_session_num := p_session_number / 2; -- 2→1, 4→2, 6→3, 8→4
    END IF;
  ELSE
    -- 1-slot enrollment: sessions 1-4
    IF p_session_number < 1 OR p_session_number > 4 THEN
      RAISE EXCEPTION 'Invalid session number for 1-slot enrollment (must be 1-4)';
    END IF;
    v_slot_class_id := COALESCE(v_enrollment.slot_1_class_id, v_enrollment.class_id);
    v_slot_session_num := p_session_number;
  END IF;

  -- Fetch class for meeting_day
  SELECT cl.meeting_day INTO v_class
  FROM classes cl
  WHERE cl.id = v_slot_class_id;

  -- Start date: use student_start_date if available, else fall back to class_start_date or course
  v_start_date := v_enrollment.student_start_date;
  IF v_start_date IS NULL THEN
    SELECT cl.class_start_date INTO v_start_date
    FROM classes cl
    WHERE cl.id = v_slot_class_id;
  END IF;

  IF v_start_date IS NULL THEN
    RAISE EXCEPTION 'Cannot compute session date: no start date available';
  END IF;

  target_class_id := v_slot_class_id;
  session_date := compute_session_date(v_start_date, v_class.meeting_day, v_slot_session_num);
  RETURN NEXT;
END;
$$;

-- =============================================================================
-- 2. RESERVE_SEAT — new dual-slot signature
-- Drop old overloads (5-param from pre-00059, 6-param from 00059)
-- =============================================================================
DROP FUNCTION IF EXISTS public.reserve_seat(UUID, UUID, UUID, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.reserve_seat(UUID, UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN);

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
         cl.name, cl.subject, cl.level, cl.class_start_date, cl.class_end_date,
         cl.course_id
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
    -- LG: use class dates
    v_start_date := v_slot1.class_start_date;
    v_end_date := v_slot1.class_end_date;
  ELSE
    -- SG/1:1: rolling, start now, end in 1 month
    v_start_date := CURRENT_DATE;
    v_end_date := CURRENT_DATE + INTERVAL '1 month';
  END IF;

  IF p_pay_later THEN
    INSERT INTO enrollments (
      student_id, class_id, slot_1_class_id, slot_2_class_id,
      course_id, status, payment_status, payment_deadline,
      student_start_date, student_end_date,
      agreement_version, agreement_timestamp
    ) VALUES (
      p_student_id, p_slot_1_class_id, p_slot_1_class_id, p_slot_2_class_id,
      NULL, 'active', 'unpaid', v_start_date + INTERVAL '7 days',
      v_start_date, v_end_date,
      p_agreement_version, p_agreement_timestamp
    )
    RETURNING id INTO v_enrollment_id;
  ELSE
    INSERT INTO enrollments (
      student_id, class_id, slot_1_class_id, slot_2_class_id,
      course_id, status, payment_status,
      student_start_date, student_end_date,
      agreement_version, agreement_timestamp
    ) VALUES (
      p_student_id, p_slot_1_class_id, p_slot_1_class_id, p_slot_2_class_id,
      NULL, 'pending', 'paid',
      v_start_date, v_end_date,
      p_agreement_version, p_agreement_timestamp
    )
    RETURNING id INTO v_enrollment_id;
  END IF;

  RETURN v_enrollment_id;
END;
$$;

-- =============================================================================
-- 3. CANCEL_SESSION — dual-slot session mapping, block LG
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

  -- Insert cancellation (course_id NULL for new enrollments)
  INSERT INTO public.session_cancellations (
    enrollment_id, student_id, course_id, class_id,
    session_number, session_date, group_size_type,
    reason, cancelled_by, status, credit_deadline
  ) VALUES (
    p_enrollment_id, v_enrollment.student_id, v_enrollment.course_id,
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
-- 4. DROP_ENROLLMENT — per-student phase boundaries, release 2 seats
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
  SELECT e.id, e.student_id, e.class_id, e.course_id, e.status, e.payment_status,
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

  -- Determine start date: prefer student_start_date, fall back to class dates or course
  v_start_date := v_enrollment.student_start_date;
  IF v_start_date IS NULL THEN
    SELECT cl.class_start_date INTO v_start_date
    FROM classes cl
    WHERE cl.id = COALESCE(v_enrollment.slot_1_class_id, v_enrollment.class_id);
  END IF;
  IF v_start_date IS NULL AND v_enrollment.course_id IS NOT NULL THEN
    SELECT c.start_date INTO v_start_date
    FROM courses c
    WHERE c.id = v_enrollment.course_id;
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
    -- No start date (shouldn't happen, but default to phase 2 for safety)
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
-- 5. AUTO_ENROLL_FROM_WAITLIST — rolling-aware
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
         cl.class_start_date, cl.class_end_date, cl.course_id
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
  -- SG/1:1: always eligible (rolling enrollment)

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
        course_id, status, payment_status, payment_deadline,
        student_start_date, student_end_date,
        agreement_version, agreement_timestamp
      ) VALUES (
        v_entry.student_id, p_class_id, p_class_id,
        v_class.course_id, 'active', 'unpaid', v_start_date + INTERVAL '7 days',
        v_start_date, v_end_date,
        v_entry.agreement_version, v_entry.agreement_timestamp
      )
      RETURNING id INTO v_enrollment_id;
    EXCEPTION WHEN unique_violation THEN
      -- Student already has active/pending enrollment in this class
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
-- 6. BOOK_MAKEUP_SESSION — subject+level+group_size match (not course match)
-- Now works for SG AND 1:1 (removed one_on_one guard)
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
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_host_session_date DATE;
  v_orig_week_start DATE;
  v_host_week_start DATE;
  v_active_count INTEGER;
  v_makeup_count INTEGER;
  v_booking_id UUID;
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

  -- Block LG (no cancellation/makeup for large groups)
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

  -- Match by subject + level + group_size_type (not course)
  IF v_host_class.subject != v_orig_class.subject
     OR v_host_class.level != v_orig_class.level
     OR v_host_class.group_size_type != v_orig_class.group_size_type THEN
    RAISE EXCEPTION 'Host class must match subject, level, and group size type';
  END IF;

  -- Must be a different class
  IF v_host_class.id = v_cancellation.class_id THEN
    RAISE EXCEPTION 'Cannot book makeup in the same class';
  END IF;

  -- 5. Compute host session date for the same session number
  v_host_session_date := public.compute_session_date(
    COALESCE(v_host_class.class_start_date,
             (SELECT cl.class_start_date FROM classes cl WHERE cl.id = v_cancellation.class_id)),
    v_host_class.meeting_day,
    v_cancellation.session_number
  );

  -- 6. Validate same week (Sunday-based)
  v_orig_week_start := v_cancellation.session_date - EXTRACT(DOW FROM v_cancellation.session_date)::INTEGER;
  v_host_week_start := v_host_session_date - EXTRACT(DOW FROM v_host_session_date)::INTEGER;

  IF v_orig_week_start != v_host_week_start THEN
    RAISE EXCEPTION 'Host session must be in the same week as the cancelled session';
  END IF;

  -- 7. Must be in the future
  IF v_host_session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book a makeup for a past or current-day session';
  END IF;

  -- 8. Capacity check: enrollments + makeups < capacity
  SELECT COUNT(*) INTO v_active_count
  FROM public.enrollments enr
  WHERE (enr.slot_1_class_id = p_host_class_id OR enr.slot_2_class_id = p_host_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_host_class_id))
    AND enr.status = 'active';

  SELECT COUNT(*) INTO v_makeup_count
  FROM public.makeup_bookings mb
  WHERE mb.host_class_id = p_host_class_id
    AND mb.session_number = v_cancellation.session_number
    AND mb.status = 'booked';

  IF (v_active_count + v_makeup_count) >= v_host_class.capacity THEN
    RAISE EXCEPTION 'Host class session is full';
  END IF;

  -- 9. Insert booking (no host_course_id in new model)
  INSERT INTO public.makeup_bookings (
    cancellation_id, student_id, host_class_id, enrollment_id,
    session_number, session_date, status
  ) VALUES (
    p_cancellation_id, v_cancellation.student_id, p_host_class_id,
    v_cancellation.enrollment_id,
    v_cancellation.session_number, v_host_session_date, 'booked'
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
      'session_number', v_cancellation.session_number,
      'session_date', v_host_session_date
    )
  );

  RETURN v_booking_id;
END;
$$;

-- =============================================================================
-- 7. MARK_STUDENT_ABSENT — enrollment-scoped duplicate check
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

-- =============================================================================
-- 8. AUTO_BOOK_MAKEUP_FROM_WAITLIST — updated capacity counting
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_book_makeup_from_waitlist(
  p_host_class_id UUID,
  p_session_number INTEGER
)
RETURNS TABLE(booking_id UUID, student_id UUID, waitlist_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_class RECORD;
  v_entry RECORD;
  v_cancel RECORD;
  v_orig_class RECORD;
  v_active_count INTEGER;
  v_makeup_count INTEGER;
  v_host_session_date DATE;
  v_orig_week_start DATE;
  v_host_week_start DATE;
  v_new_booking_id UUID;
BEGIN
  -- Lock the host class
  SELECT * INTO v_host_class
  FROM classes cl
  WHERE cl.id = p_host_class_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_host_class.active THEN
    RETURN;
  END IF;

  -- FIFO through waiting entries
  FOR v_entry IN
    SELECT mw.*
    FROM makeup_waitlist mw
    WHERE mw.host_class_id = p_host_class_id
      AND mw.session_number = p_session_number
      AND mw.status = 'waiting'
    ORDER BY mw.created_at ASC
    FOR UPDATE
  LOOP
    -- Check capacity
    SELECT COUNT(*) INTO v_active_count
    FROM enrollments enr
    WHERE (enr.slot_1_class_id = p_host_class_id OR enr.slot_2_class_id = p_host_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_host_class_id))
      AND enr.status = 'active';

    SELECT COUNT(*) INTO v_makeup_count
    FROM makeup_bookings mb
    WHERE mb.host_class_id = p_host_class_id
      AND mb.session_number = p_session_number
      AND mb.status = 'booked';

    IF (v_active_count + v_makeup_count) >= v_host_class.capacity THEN
      EXIT;
    END IF;

    -- Verify cancellation still in cancelled status
    SELECT * INTO v_cancel
    FROM session_cancellations sc
    WHERE sc.id = v_entry.cancellation_id
    FOR UPDATE;

    IF NOT FOUND OR v_cancel.status <> 'cancelled' THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Verify subject+level match via classes (not courses)
    SELECT * INTO v_orig_class FROM classes WHERE id = v_cancel.class_id;
    IF v_orig_class.subject != v_host_class.subject
       OR v_orig_class.level != v_host_class.level
       OR v_orig_class.group_size_type != v_host_class.group_size_type THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Delete previous cancelled booking
    DELETE FROM makeup_bookings
    WHERE cancellation_id = v_entry.cancellation_id
      AND status = 'cancelled';

    -- Insert booking
    BEGIN
      INSERT INTO makeup_bookings (
        cancellation_id, student_id, host_class_id, enrollment_id,
        session_number, session_date, status
      ) VALUES (
        v_entry.cancellation_id, v_entry.student_id, p_host_class_id,
        v_cancel.enrollment_id,
        v_entry.session_number, v_entry.session_date, 'booked'
      ) RETURNING id INTO v_new_booking_id;
    EXCEPTION WHEN unique_violation THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END;

    -- Update cancellation status
    UPDATE session_cancellations
    SET status = 'rescheduled'
    WHERE id = v_entry.cancellation_id;

    -- Mark waitlist entry as booked
    UPDATE makeup_waitlist
    SET status = 'booked'
    WHERE id = v_entry.id;

    -- Log
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
      'makeup_auto_booked',
      jsonb_build_object(
        'booking_id', v_new_booking_id,
        'cancellation_id', v_entry.cancellation_id,
        'student_id', v_entry.student_id,
        'host_class_id', p_host_class_id,
        'waitlist_id', v_entry.id
      )
    );

    booking_id := v_new_booking_id;
    student_id := v_entry.student_id;
    waitlist_id := v_entry.id;
    RETURN NEXT;
  END LOOP;
END;
$$;
