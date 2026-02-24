-- Migration 00041: Three-phase drop class system
-- Phase 1: >7 days before start_date → self-serve drop (existing)
-- Phase 2: ≤7 days before start → 7 days after first session → note drop + class_blocked
-- Phase 3: >7 days after first session → admin consultation only

-- =============================================================================
-- 1. Add class_blocked column to enrollments
-- =============================================================================
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS class_blocked BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- 2. Add optional context columns to bookings (for refund consultations)
-- =============================================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS student_name TEXT,
  ADD COLUMN IF NOT EXISTS class_name TEXT;

-- =============================================================================
-- 3. Replace drop_enrollment RPC with 3-phase logic
-- =============================================================================
CREATE OR REPLACE FUNCTION public.drop_enrollment(
  p_enrollment_id UUID,
  p_reason TEXT,
  p_dropped_by UUID DEFAULT NULL,
  p_phase INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_course RECORD;
  v_class RECORD;
  v_caller UUID;
  v_caller_role TEXT;
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
  v_is_parent BOOLEAN;
  v_days_until_start INTEGER;
  v_first_session_date DATE;
  v_days_since_first_session INTEGER;
BEGIN
  -- Determine caller
  v_caller := COALESCE(p_dropped_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock enrollment row
  SELECT e.id, e.student_id, e.class_id, e.course_id, e.status
  INTO v_enrollment
  FROM enrollments e
  WHERE e.id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  IF v_enrollment.status <> 'active' THEN
    RAISE EXCEPTION 'Enrollment is not active (current status: %)', v_enrollment.status;
  END IF;

  -- Check caller role
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller;
  v_is_admin := (v_caller_role = 'admin');

  -- Check if caller is the student (via students table)
  SELECT EXISTS(
    SELECT 1 FROM students WHERE user_id = v_caller AND id = v_enrollment.student_id
  ) INTO v_is_owner;

  -- Check if caller is the parent
  SELECT EXISTS(
    SELECT 1 FROM students WHERE parent_id = v_caller AND id = v_enrollment.student_id
  ) INTO v_is_parent;

  IF NOT (v_is_admin OR v_is_owner OR v_is_parent) THEN
    RAISE EXCEPTION 'Not authorized to drop this enrollment';
  END IF;

  -- Get course start_date
  SELECT start_date, end_date INTO v_course FROM courses WHERE id = v_enrollment.course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  -- Get class meeting_day for first session computation
  SELECT meeting_day INTO v_class FROM classes WHERE id = v_enrollment.class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  v_days_until_start := v_course.start_date - CURRENT_DATE;
  v_first_session_date := public.compute_session_date(v_course.start_date, v_class.meeting_day, 1);
  v_days_since_first_session := CURRENT_DATE - v_first_session_date;

  -- Enforce phase rules for non-admins
  IF NOT v_is_admin THEN
    IF p_phase = 1 THEN
      -- Phase 1: must be > 7 days before start
      IF v_days_until_start <= 7 THEN
        RAISE EXCEPTION 'Cannot self-drop within 7 days of course start.';
      END IF;
    ELSIF p_phase = 2 THEN
      -- Phase 2: must be within window (≤7 days before start to 7 days after first session)
      IF v_days_until_start > 7 THEN
        RAISE EXCEPTION 'Phase 2 drop not applicable — course start is more than 7 days away.';
      END IF;
      IF v_days_since_first_session > 7 THEN
        RAISE EXCEPTION 'Phase 2 drop window has passed. Please request a refund consultation.';
      END IF;
    ELSIF p_phase = 3 THEN
      -- Phase 3: non-admin cannot drop via RPC, must go through consultation
      RAISE EXCEPTION 'Cannot self-drop in Phase 3. Please schedule a refund consultation.';
    ELSE
      RAISE EXCEPTION 'Invalid drop phase: %', p_phase;
    END IF;
  END IF;

  -- Cancel enrollment
  UPDATE enrollments
  SET status = 'canceled',
      class_blocked = CASE WHEN p_phase = 2 THEN true ELSE class_blocked END
  WHERE id = p_enrollment_id;

  -- Log to admin_logs
  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'enrollment_dropped',
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'student_id', v_enrollment.student_id,
      'class_id', v_enrollment.class_id,
      'course_id', v_enrollment.course_id,
      'reason', p_reason,
      'phase', p_phase,
      'days_until_start', v_days_until_start,
      'days_since_first_session', v_days_since_first_session,
      'dropped_by_role', v_caller_role
    )
  );

  RETURN p_enrollment_id;
END;
$$;
