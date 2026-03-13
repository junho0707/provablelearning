-- ============================================================
-- Migration 00083: Subject-agnostic SG rework
--
-- Major changes:
-- 1. Subject moves from class to enrollment (SG/1:1 classes become subject-agnostic slots)
-- 2. Levels dropped entirely for SG/1:1
-- 3. SG capacity changes to 1-3, supports 2 or 3 slots per week
-- 4. New pricing: SG 2x=$300/mo, SG 3x=$400/mo
-- 5. Google Classroom for SG switches from shared to per-student
-- ============================================================

-- =============================================================================
-- 1. New enum for subject category (stored on enrollment, not class)
-- =============================================================================

CREATE TYPE subject_category AS ENUM ('dsat_rw', 'dsat_math', 'dsat_rw_math', 'general_math');

-- =============================================================================
-- 2. Add columns to enrollments
-- =============================================================================

ALTER TABLE enrollments
  ADD COLUMN subject_category subject_category,
  ADD COLUMN subject_detail TEXT,
  ADD COLUMN slot_3_class_id UUID REFERENCES classes(id),
  ADD COLUMN slots_per_week INTEGER DEFAULT 2;

-- =============================================================================
-- 3. Make subject and level nullable on classes (SG/1:1 will be NULL)
-- =============================================================================

ALTER TABLE classes ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE classes ALTER COLUMN level DROP NOT NULL;

-- =============================================================================
-- 4. Drop old constraints that enforce subject/level rules
-- =============================================================================

ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_one_on_one_all_levels;
ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_group_no_rw_math;
ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_capacity_small;

-- =============================================================================
-- 5. Add new constraints
-- =============================================================================

-- SG capacity: 1-3
ALTER TABLE classes ADD CONSTRAINT chk_capacity_small CHECK (
  group_size_type != 'small' OR (capacity >= 1 AND capacity <= 3)
);

-- LG still requires subject+level
ALTER TABLE classes ADD CONSTRAINT chk_lg_requires_subject CHECK (
  group_size_type != 'large' OR (subject IS NOT NULL AND level IS NOT NULL)
);

-- SG/1:1 should NOT have subject/level (agnostic)
ALTER TABLE classes ADD CONSTRAINT chk_sg_1on1_no_subject CHECK (
  group_size_type NOT IN ('small', 'one_on_one') OR (subject IS NULL AND level IS NULL)
);

-- slots_per_week must be 2 or 3 (or NULL for LG)
ALTER TABLE enrollments ADD CONSTRAINT chk_slots_per_week CHECK (
  slots_per_week IS NULL OR slots_per_week IN (2, 3)
);

-- slot_3 only when slots_per_week = 3
ALTER TABLE enrollments ADD CONSTRAINT chk_slot_3_consistency CHECK (
  (slots_per_week = 3 AND slot_3_class_id IS NOT NULL)
  OR (slots_per_week != 3 AND slot_3_class_id IS NULL)
  OR slots_per_week IS NULL
);

-- =============================================================================
-- 6. Backfill existing enrollments
-- =============================================================================

UPDATE enrollments e
SET subject_category = CASE
      WHEN c.subject = 'digital_rw' THEN 'dsat_rw'::subject_category
      WHEN c.subject = 'digital_math' THEN 'dsat_math'::subject_category
      WHEN c.subject = 'digital_rw_math' THEN 'dsat_rw_math'::subject_category
    END,
    slots_per_week = CASE
      WHEN e.slot_2_class_id IS NOT NULL THEN 2
      ELSE NULL
    END
FROM classes c
WHERE c.id = COALESCE(e.slot_1_class_id, e.class_id);

-- =============================================================================
-- 7. Clear subject/level on existing SG and 1:1 classes
-- =============================================================================

UPDATE classes SET subject = NULL, level = NULL
WHERE group_size_type IN ('small', 'one_on_one');

-- =============================================================================
-- 8. COMPUTE_ENROLLMENT_SESSION — handle 3-slot round-robin
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
  v_max_sessions INTEGER;
BEGIN
  SELECT e.slot_1_class_id, e.slot_2_class_id, e.slot_3_class_id,
         e.student_start_date, e.student_end_date,
         e.class_id, e.slots_per_week
  INTO v_enrollment
  FROM enrollments e
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  -- Determine max sessions and slot mapping
  IF v_enrollment.slot_3_class_id IS NOT NULL THEN
    -- 3-slot enrollment: 12 sessions, round-robin
    v_max_sessions := 12;
    IF p_session_number < 1 OR p_session_number > 12 THEN
      RAISE EXCEPTION 'Invalid session number for 3-slot enrollment (must be 1-12)';
    END IF;
    -- Round-robin: 1,4,7,10 → slot_1; 2,5,8,11 → slot_2; 3,6,9,12 → slot_3
    CASE ((p_session_number - 1) % 3)
      WHEN 0 THEN
        v_slot_class_id := v_enrollment.slot_1_class_id;
        v_slot_session_num := ((p_session_number - 1) / 3) + 1;
      WHEN 1 THEN
        v_slot_class_id := v_enrollment.slot_2_class_id;
        v_slot_session_num := ((p_session_number - 1) / 3) + 1;
      WHEN 2 THEN
        v_slot_class_id := v_enrollment.slot_3_class_id;
        v_slot_session_num := ((p_session_number - 1) / 3) + 1;
    END CASE;
  ELSIF v_enrollment.slot_2_class_id IS NOT NULL THEN
    -- 2-slot enrollment: odd → slot_1, even → slot_2
    v_max_sessions := 8;
    IF p_session_number < 1 OR p_session_number > 8 THEN
      RAISE EXCEPTION 'Invalid session number for 2-slot enrollment (must be 1-8)';
    END IF;
    IF p_session_number % 2 = 1 THEN
      v_slot_class_id := v_enrollment.slot_1_class_id;
      v_slot_session_num := (p_session_number + 1) / 2;
    ELSE
      v_slot_class_id := v_enrollment.slot_2_class_id;
      v_slot_session_num := p_session_number / 2;
    END IF;
  ELSE
    -- 1-slot enrollment: sessions 1-4
    v_max_sessions := 4;
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

  -- Start date
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
-- 9. RESERVE_SEAT — add slot_3, subject_category, slots_per_week;
--    remove subject/level matching between slots
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reserve_seat(
  p_student_id UUID,
  p_slot_1_class_id UUID,
  p_slot_2_class_id UUID DEFAULT NULL,
  p_agreement_version TEXT DEFAULT NULL,
  p_agreement_timestamp TIMESTAMPTZ DEFAULT NULL,
  p_pay_later BOOLEAN DEFAULT false,
  p_student_start_date DATE DEFAULT NULL,
  p_slot_3_class_id UUID DEFAULT NULL,
  p_subject_category subject_category DEFAULT NULL,
  p_subject_detail TEXT DEFAULT NULL,
  p_slots_per_week INTEGER DEFAULT 2
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot1 RECORD;
  v_slot2 RECORD;
  v_slot3 RECORD;
  v_enrolled_1 INTEGER;
  v_enrolled_2 INTEGER;
  v_enrolled_3 INTEGER;
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
         cl.name, cl.class_start_date, cl.class_end_date
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

  -- Capacity check slot 1 (include slot_3)
  SELECT COUNT(*) INTO v_enrolled_1
  FROM enrollments enr
  WHERE (enr.slot_1_class_id = p_slot_1_class_id
         OR enr.slot_2_class_id = p_slot_1_class_id
         OR enr.slot_3_class_id = p_slot_1_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_slot_1_class_id))
    AND enr.status IN ('pending', 'active');

  IF v_enrolled_1 >= v_slot1.capacity THEN
    RAISE EXCEPTION 'Slot 1 class is full';
  END IF;

  -- Lock and validate slot 2 if provided
  IF p_slot_2_class_id IS NOT NULL THEN
    SELECT cl.id, cl.capacity, cl.active, cl.group_size_type, cl.meeting_day,
           cl.name, cl.class_start_date, cl.class_end_date
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

    -- Must be same group_size_type (no longer require subject/level match)
    IF v_slot1.group_size_type != v_slot2.group_size_type THEN
      RAISE EXCEPTION 'Both slots must have the same group size type';
    END IF;

    -- Must be different classes
    IF p_slot_1_class_id = p_slot_2_class_id THEN
      RAISE EXCEPTION 'Slot 1 and Slot 2 must be different classes';
    END IF;

    -- Capacity check slot 2
    SELECT COUNT(*) INTO v_enrolled_2
    FROM enrollments enr
    WHERE (enr.slot_1_class_id = p_slot_2_class_id
           OR enr.slot_2_class_id = p_slot_2_class_id
           OR enr.slot_3_class_id = p_slot_2_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_slot_2_class_id))
      AND enr.status IN ('pending', 'active');

    IF v_enrolled_2 >= v_slot2.capacity THEN
      RAISE EXCEPTION 'Slot 2 class is full';
    END IF;
  END IF;

  -- Lock and validate slot 3 if provided
  IF p_slot_3_class_id IS NOT NULL THEN
    SELECT cl.id, cl.capacity, cl.active, cl.group_size_type, cl.meeting_day,
           cl.name, cl.class_start_date, cl.class_end_date
    INTO v_slot3
    FROM classes cl
    WHERE cl.id = p_slot_3_class_id
    FOR UPDATE OF cl;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Slot 3 class not found';
    END IF;

    IF NOT v_slot3.active THEN
      RAISE EXCEPTION 'Slot 3 class is not active';
    END IF;

    IF v_slot1.group_size_type != v_slot3.group_size_type THEN
      RAISE EXCEPTION 'All slots must have the same group size type';
    END IF;

    -- Must be different from slot 1 and slot 2
    IF p_slot_3_class_id = p_slot_1_class_id OR p_slot_3_class_id = p_slot_2_class_id THEN
      RAISE EXCEPTION 'Slot 3 must be a different class from slots 1 and 2';
    END IF;

    -- Capacity check slot 3
    SELECT COUNT(*) INTO v_enrolled_3
    FROM enrollments enr
    WHERE (enr.slot_1_class_id = p_slot_3_class_id
           OR enr.slot_2_class_id = p_slot_3_class_id
           OR enr.slot_3_class_id = p_slot_3_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_slot_3_class_id))
      AND enr.status IN ('pending', 'active');

    IF v_enrolled_3 >= v_slot3.capacity THEN
      RAISE EXCEPTION 'Slot 3 class is full';
    END IF;
  END IF;

  -- Compute start/end dates
  IF v_slot1.group_size_type = 'large' THEN
    v_start_date := v_slot1.class_start_date;
    v_end_date := v_slot1.class_end_date;
  ELSE
    v_start_date := COALESCE(p_student_start_date, CURRENT_DATE);
    v_end_date := v_start_date + INTERVAL '1 month';
  END IF;

  IF p_pay_later THEN
    INSERT INTO enrollments (
      student_id, class_id, slot_1_class_id, slot_2_class_id, slot_3_class_id,
      status, payment_status, payment_deadline,
      student_start_date, student_end_date,
      agreement_version, agreement_timestamp,
      subject_category, subject_detail, slots_per_week
    ) VALUES (
      p_student_id, p_slot_1_class_id, p_slot_1_class_id, p_slot_2_class_id, p_slot_3_class_id,
      'active', 'unpaid', v_start_date + INTERVAL '7 days',
      v_start_date, v_end_date,
      p_agreement_version, p_agreement_timestamp,
      p_subject_category, p_subject_detail, p_slots_per_week
    )
    RETURNING id INTO v_enrollment_id;
  ELSE
    INSERT INTO enrollments (
      student_id, class_id, slot_1_class_id, slot_2_class_id, slot_3_class_id,
      status, payment_status,
      student_start_date, student_end_date,
      agreement_version, agreement_timestamp,
      subject_category, subject_detail, slots_per_week
    ) VALUES (
      p_student_id, p_slot_1_class_id, p_slot_1_class_id, p_slot_2_class_id, p_slot_3_class_id,
      'pending', 'paid',
      v_start_date, v_end_date,
      p_agreement_version, p_agreement_timestamp,
      p_subject_category, p_subject_detail, p_slots_per_week
    )
    RETURNING id INTO v_enrollment_id;
  END IF;

  RETURN v_enrollment_id;
END;
$$;

-- =============================================================================
-- 10. CANCEL_SESSION — handle 3-slot max sessions
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

  -- Determine max sessions (3-slot = 12, 2-slot = 8, 1-slot = 4)
  IF v_enrollment.slot_3_class_id IS NOT NULL THEN
    v_max_sessions := 12;
  ELSIF v_enrollment.slot_2_class_id IS NOT NULL THEN
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
-- 11. MARK_STUDENT_ABSENT — update max session check to handle 3-slot
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
  v_max_sessions INTEGER;
BEGIN
  -- Validate admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized: admin only';
  END IF;

  -- Find active enrollment for student + class (check all slot columns)
  SELECT enr.* INTO v_enrollment
  FROM public.enrollments enr
  WHERE enr.student_id = p_student_id
    AND (enr.slot_1_class_id = p_class_id
         OR enr.slot_2_class_id = p_class_id
         OR enr.slot_3_class_id = p_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
    AND enr.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active enrollment found for student+class';
  END IF;

  -- Determine max sessions
  IF v_enrollment.slot_3_class_id IS NOT NULL THEN
    v_max_sessions := 12;
  ELSIF v_enrollment.slot_2_class_id IS NOT NULL THEN
    v_max_sessions := 8;
  ELSE
    v_max_sessions := 4;
  END IF;

  IF p_session_number < 1 OR p_session_number > v_max_sessions THEN
    RAISE EXCEPTION 'Invalid session number (must be 1-%)', v_max_sessions;
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

-- =============================================================================
-- 12. BOOK_MAKEUP_SESSION — remove subject/level match for SG;
--     add slot_3 to capacity queries and enrolled-class check
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

  -- 4. Load original class — only require group_size_type match (no subject/level)
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

  -- 4b. Block booking into a class the student is already enrolled in (check all 3 slots)
  SELECT enr.* INTO v_enrollment
  FROM public.enrollments enr
  WHERE enr.id = v_cancellation.enrollment_id;

  IF v_enrollment.slot_1_class_id = p_host_class_id
     OR v_enrollment.slot_2_class_id = p_host_class_id
     OR v_enrollment.slot_3_class_id = p_host_class_id
     OR (v_enrollment.slot_1_class_id IS NULL AND v_enrollment.class_id = p_host_class_id) THEN
    RAISE EXCEPTION 'Cannot book makeup in a class you are already enrolled in';
  END IF;

  -- 5. Determine start date
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

  -- 8. Capacity check (include slot_3)
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
-- 13. AUTO_ENROLL_FROM_WAITLIST — remove subject/level matching;
--     add slot_3 to capacity queries
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
         cl.group_size_type,
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

  -- Check capacity (include slot_3)
  SELECT COUNT(*) INTO v_current_count
  FROM enrollments enr
  WHERE (enr.slot_1_class_id = p_class_id
         OR enr.slot_2_class_id = p_class_id
         OR enr.slot_3_class_id = p_class_id
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
      AND (enr.slot_1_class_id = p_class_id
           OR enr.slot_2_class_id = p_class_id
           OR enr.slot_3_class_id = p_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
      AND enr.status IN ('pending', 'active');

    IF v_dup_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check: no time conflict (slot_1)
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

    -- Also check slot_3 for conflicts
    IF v_conflict_count = 0 THEN
      SELECT COUNT(*) INTO v_conflict_count
      FROM enrollments enr
      JOIN classes c3 ON c3.id = enr.slot_3_class_id
      WHERE enr.student_id = v_entry.student_id
        AND enr.status IN ('pending', 'active')
        AND enr.slot_3_class_id IS NOT NULL
        AND c3.meeting_day = v_class.meeting_day
        AND c3.meeting_time = v_class.meeting_time;
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

    -- Re-check capacity (include slot_3)
    SELECT COUNT(*) INTO v_current_count
    FROM enrollments enr
    WHERE (enr.slot_1_class_id = p_class_id
           OR enr.slot_2_class_id = p_class_id
           OR enr.slot_3_class_id = p_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
      AND enr.status IN ('pending', 'active');

    IF v_current_count >= v_class.capacity THEN
      EXIT;
    END IF;
  END LOOP;
END;
$$;
