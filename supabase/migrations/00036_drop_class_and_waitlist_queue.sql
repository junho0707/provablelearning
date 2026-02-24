-- Migration 00036: drop_enrollment RPC, waitlist_notify_queue table, trigger

-- =============================================================================
-- 1. drop_enrollment RPC (SECURITY DEFINER)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.drop_enrollment(
  p_enrollment_id UUID,
  p_reason TEXT,
  p_dropped_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_course RECORD;
  v_caller UUID;
  v_caller_role TEXT;
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
  v_is_parent BOOLEAN;
  v_days_until_start INTEGER;
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
  SELECT start_date INTO v_course FROM courses WHERE id = v_enrollment.course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  v_days_until_start := v_course.start_date - CURRENT_DATE;

  -- Non-admin: must be > 7 days before start
  IF NOT v_is_admin AND v_days_until_start <= 7 THEN
    RAISE EXCEPTION 'Cannot self-drop within 7 days of course start. Please contact your tutor to arrange a drop.';
  END IF;

  -- Cancel enrollment
  UPDATE enrollments
  SET status = 'canceled'
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
      'days_until_start', v_days_until_start,
      'dropped_by_role', v_caller_role
    )
  );

  RETURN p_enrollment_id;
END;
$$;

-- =============================================================================
-- 2. waitlist_notify_queue table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.waitlist_notify_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed BOOLEAN NOT NULL DEFAULT false
);

-- Index for unprocessed queue items
CREATE INDEX IF NOT EXISTS idx_waitlist_notify_queue_unprocessed
  ON public.waitlist_notify_queue (created_at)
  WHERE processed = false;

-- RLS: only service role needs access
ALTER TABLE public.waitlist_notify_queue ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Trigger: queue waitlist notification on enrollment drop/cancel/refund
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_queue_waitlist_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO waitlist_notify_queue (class_id)
    VALUES (OLD.class_id);
    RETURN OLD;
  END IF;

  -- UPDATE: status changed to canceled or refunded
  IF TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status IN ('canceled', 'refunded')
  THEN
    INSERT INTO waitlist_notify_queue (class_id)
    VALUES (NEW.class_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_waitlist_notification ON public.enrollments;
CREATE TRIGGER trg_queue_waitlist_notification
  AFTER DELETE OR UPDATE ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_queue_waitlist_notification();
