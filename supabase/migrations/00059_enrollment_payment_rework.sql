-- Migration 00059: Enrollment Payment Rework
-- Adds pay-now/pay-later choice, shifts phase boundaries to 14 days,
-- prevents paid students from self-dropping, expands Phase 2 blocking
-- to include group_size_type, locks roster at course start, and
-- auto-unenrolls unpaid students 7 days after start.

-- 1a. New columns on enrollments
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'unpaid')),
  ADD COLUMN IF NOT EXISTS payment_deadline DATE,
  ADD COLUMN IF NOT EXISTS group_size_blocked BOOLEAN NOT NULL DEFAULT false;

-- 1b. Replace drop_enrollment RPC (return type changed UUID→VOID, must DROP first)
DROP FUNCTION IF EXISTS public.drop_enrollment(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.drop_enrollment(UUID, TEXT, UUID, INTEGER);
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
  v_course RECORD;
  v_is_admin BOOLEAN;
  v_days_until_start INTEGER;
  v_days_since_start INTEGER;
  v_computed_phase INTEGER;
BEGIN
  -- Fetch enrollment with FOR UPDATE lock
  SELECT e.id, e.student_id, e.class_id, e.course_id, e.status, e.payment_status,
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
    -- Must be student or parent
    IF v_enrollment.student_user_id <> p_dropped_by
       AND v_enrollment.student_parent_id <> p_dropped_by THEN
      RAISE EXCEPTION 'Not authorized to drop this enrollment';
    END IF;

    -- Paid students cannot self-drop (must use refund consultation)
    IF v_enrollment.payment_status = 'paid' THEN
      RAISE EXCEPTION 'Cannot self-drop a paid enrollment. Please schedule a refund consultation.';
    END IF;
  END IF;

  -- Fetch course dates
  SELECT c.start_date, c.end_date
  INTO v_course
  FROM courses c
  WHERE c.id = v_enrollment.course_id;

  -- Compute phase boundaries
  v_days_until_start := (v_course.start_date - CURRENT_DATE);
  v_days_since_start := (CURRENT_DATE - v_course.start_date);

  IF v_days_until_start > 14 THEN
    v_computed_phase := 1;
  ELSIF v_days_since_start <= 7 THEN
    v_computed_phase := 2;
  ELSE
    v_computed_phase := 3;
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

-- 1c. Replace reserve_seat RPC with pay-later support
CREATE OR REPLACE FUNCTION public.reserve_seat(
  p_student_id UUID,
  p_class_id UUID,
  p_course_id UUID,
  p_agreement_version TEXT,
  p_agreement_timestamp TIMESTAMPTZ,
  p_pay_later BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class RECORD;
  v_enrolled INTEGER;
  v_enrollment_id UUID;
BEGIN
  -- Validate agreement
  IF p_agreement_version IS NULL OR p_agreement_timestamp IS NULL THEN
    RAISE EXCEPTION 'Agreement must be accepted before enrollment';
  END IF;

  -- Lock class row
  SELECT cl.capacity, cl.active, cl.course_id, c.start_date
  INTO v_class
  FROM classes cl
  JOIN courses c ON c.id = cl.course_id
  WHERE cl.id = p_class_id
  FOR UPDATE OF cl;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  IF NOT v_class.active THEN
    RAISE EXCEPTION 'Class is not active';
  END IF;

  IF v_class.course_id <> p_course_id THEN
    RAISE EXCEPTION 'Class does not belong to specified course';
  END IF;

  -- Roster lock: no new enrollments after course starts
  IF v_class.start_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Course has already started — enrollment is closed';
  END IF;

  -- Count current pending + active enrollments
  SELECT COUNT(*)
  INTO v_enrolled
  FROM enrollments
  WHERE class_id = p_class_id
    AND status IN ('pending', 'active');

  IF v_enrolled >= v_class.capacity THEN
    RAISE EXCEPTION 'Class is full';
  END IF;

  IF p_pay_later THEN
    -- Pay-later: insert as active + unpaid
    INSERT INTO enrollments (
      student_id, class_id, course_id,
      status, payment_status, payment_deadline,
      agreement_version, agreement_timestamp
    ) VALUES (
      p_student_id, p_class_id, p_course_id,
      'active', 'unpaid', v_class.start_date + INTERVAL '7 days',
      p_agreement_version, p_agreement_timestamp
    )
    RETURNING id INTO v_enrollment_id;
  ELSE
    -- Pay-now: insert as pending + paid (awaiting Stripe confirmation)
    INSERT INTO enrollments (
      student_id, class_id, course_id,
      status, payment_status,
      agreement_version, agreement_timestamp
    ) VALUES (
      p_student_id, p_class_id, p_course_id,
      'pending', 'paid',
      p_agreement_version, p_agreement_timestamp
    )
    RETURNING id INTO v_enrollment_id;
  END IF;

  RETURN v_enrollment_id;
END;
$$;

-- 1d. Update auto_enroll_from_waitlist RPC (RETURNS TABLE column order changed, must DROP first)
DROP FUNCTION IF EXISTS public.auto_enroll_from_waitlist(UUID);
CREATE OR REPLACE FUNCTION public.auto_enroll_from_waitlist(
  p_class_id UUID
)
RETURNS TABLE(student_id UUID, enrollment_id UUID, waitlist_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class RECORD;
  v_enrolled INTEGER;
  v_waitlist_entry RECORD;
  v_new_enrollment_id UUID;
BEGIN
  -- Lock and fetch class
  SELECT cl.capacity, cl.course_id, c.start_date, c.end_date
  INTO v_class
  FROM classes cl
  JOIN courses c ON c.id = cl.course_id
  WHERE cl.id = p_class_id
  FOR UPDATE OF cl;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Guard: no auto-enroll after course starts
  IF v_class.start_date <= CURRENT_DATE THEN
    RETURN;
  END IF;

  -- Guard: no auto-enroll after course ends
  IF v_class.end_date < CURRENT_DATE THEN
    RETURN;
  END IF;

  -- Count current enrollment
  SELECT COUNT(*)
  INTO v_enrolled
  FROM enrollments enr
  WHERE enr.class_id = p_class_id
    AND enr.status IN ('pending', 'active');

  IF v_enrolled >= v_class.capacity THEN
    RETURN;
  END IF;

  -- Get first waiting entry (FIFO)
  SELECT w.id, w.student_id, w.agreement_version, w.agreement_timestamp
  INTO v_waitlist_entry
  FROM waitlist w
  WHERE w.class_id = p_class_id
    AND w.status = 'waiting'
  ORDER BY w.created_at ASC
  LIMIT 1
  FOR UPDATE OF w;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Create enrollment as active + unpaid (auto-enrolled students must pay)
  INSERT INTO enrollments (
    student_id, class_id, course_id,
    status, payment_status, payment_deadline,
    agreement_version, agreement_timestamp
  ) VALUES (
    v_waitlist_entry.student_id, p_class_id, v_class.course_id,
    'active', 'unpaid', v_class.start_date + INTERVAL '7 days',
    v_waitlist_entry.agreement_version, v_waitlist_entry.agreement_timestamp
  )
  RETURNING id INTO v_new_enrollment_id;

  -- Mark waitlist entry as converted
  UPDATE waitlist
  SET status = 'converted'
  WHERE id = v_waitlist_entry.id;

  student_id := v_waitlist_entry.student_id;
  enrollment_id := v_new_enrollment_id;
  waitlist_id := v_waitlist_entry.id;
  RETURN NEXT;
END;
$$;
