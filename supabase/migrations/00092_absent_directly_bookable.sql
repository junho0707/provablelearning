-- Migration 00092: Absences are directly bookable as makeups (no excuse note)
--   Previously: admin marks absent → status 'absent' → family submits an excuse
--               note within 7 days → status flips to 'cancelled' → makeup bookable.
--   Now:        admin marks absent → status 'cancelled' (cancelled_by_type='admin_absent')
--               → immediately bookable as a makeup, same as a self-cancellation.
--   The excuse-note step is removed entirely. cancelled_by_type still distinguishes
--   an admin-marked no-show from a voluntary self-cancellation (for the UI label
--   and audit trail). Attendance itself remains recorded in performance_logs.

-- 1. Redefine mark_student_absent to create a directly-bookable 'cancelled' row
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

  -- Only for small + one_on_one (large gets no makeup)
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

  -- Insert as 'cancelled' so it is immediately makeup-eligible (no excuse note).
  -- credit_deadline left NULL: there is no excuse deadline; the makeup is bookable
  -- for the remainder of the enrollment window (enforced by book_makeup_session).
  INSERT INTO public.session_cancellations (
    enrollment_id, student_id, class_id,
    session_number, session_date, group_size_type,
    reason, cancelled_by, status, credit_deadline,
    cancelled_by_type
  ) VALUES (
    v_enrollment.id, p_student_id, p_class_id,
    p_session_number, p_session_date, v_class.group_size_type,
    'Marked absent by admin', p_admin_id, 'cancelled', NULL,
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

-- 2. Drop the now-unused excuse-note RPC
DROP FUNCTION IF EXISTS public.submit_excuse_note(UUID, TEXT, UUID);

-- 3. Migrate existing un-booked 'absent' rows to 'cancelled' so they are bookable.
--    (Rows that already have a booked makeup were never left in 'absent' status.)
UPDATE public.session_cancellations
SET status = 'cancelled', credit_deadline = NULL
WHERE status = 'absent';
