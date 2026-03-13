-- Migration 00087: Cancel orphaned makeup bookings on enrollment drop
--
-- When a student drops their enrollment, any future makeup bookings they have
-- should be cancelled to free up capacity in the host classes.

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
  v_cancelled_makeup_count INTEGER;
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

  -- Cancel all future makeup bookings for this student
  -- Match via cancellation → enrollment link to scope to this enrollment
  UPDATE makeup_bookings mb
  SET status = 'cancelled'
  WHERE mb.student_id = v_enrollment.student_id
    AND mb.status = 'booked'
    AND mb.session_date > CURRENT_DATE
    AND mb.cancellation_id IN (
      SELECT sc.id FROM session_cancellations sc
      WHERE sc.enrollment_id = p_enrollment_id
    );

  GET DIAGNOSTICS v_cancelled_makeup_count = ROW_COUNT;

  -- Log cancelled makeups if any
  IF v_cancelled_makeup_count > 0 THEN
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      COALESCE(p_dropped_by, (SELECT id FROM users WHERE role = 'admin' LIMIT 1)),
      'makeup_bookings_cancelled_on_drop',
      jsonb_build_object(
        'enrollment_id', p_enrollment_id,
        'student_id', v_enrollment.student_id,
        'cancelled_count', v_cancelled_makeup_count,
        'reason', 'Enrollment dropped'
      )
    );
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
