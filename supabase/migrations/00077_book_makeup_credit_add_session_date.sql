-- Migration 00077: Fix book_makeup_with_credit — add p_session_date param
-- The previous version (00076) had no session_date param and hardcoded CURRENT_DATE.

-- Drop the 3-param version from 00076
DROP FUNCTION IF EXISTS public.book_makeup_with_credit(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.book_makeup_with_credit(
  p_student_id UUID,
  p_class_id UUID,
  p_session_date DATE,
  p_booked_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_class RECORD;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_credit RECORD;
  v_booking_id UUID;
  v_enrolled_count INTEGER;
  v_makeup_count INTEGER;
  v_admin_id UUID;
BEGIN
  v_caller := COALESCE(p_booked_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Session date must be in the future
  IF p_session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book a past or current-day session';
  END IF;

  -- 1. Auth check
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = v_caller AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin
     AND v_student.user_id != v_caller
     AND v_student.parent_id != v_caller
  THEN
    RAISE EXCEPTION 'Not authorized to book this makeup';
  END IF;

  -- 2. Lock + fetch class
  SELECT * INTO v_class
  FROM classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  IF NOT v_class.active THEN
    RAISE EXCEPTION 'Class is not active';
  END IF;

  -- 3. Capacity check (enrolled + booked makeups for this specific session date)
  SELECT COUNT(*) INTO v_enrolled_count
  FROM enrollments e
  WHERE (e.slot_1_class_id = p_class_id OR e.slot_2_class_id = p_class_id OR e.class_id = p_class_id)
    AND e.status IN ('pending', 'active');

  SELECT COUNT(*) INTO v_makeup_count
  FROM makeup_bookings mb
  WHERE mb.host_class_id = p_class_id
    AND mb.session_date = p_session_date
    AND mb.status = 'booked';

  IF (v_enrolled_count + v_makeup_count) >= v_class.capacity THEN
    RAISE EXCEPTION 'Class is full for this session';
  END IF;

  -- 4. Find oldest matching credit (FIFO)
  SELECT * INTO v_credit
  FROM credits cr
  WHERE cr.student_id = p_student_id
    AND cr.group_size_type = v_class.group_size_type
    AND cr.subject = v_class.subject
    AND cr.level = v_class.level
    AND cr.remaining_amount > 0
    AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
  ORDER BY cr.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No matching credit available for this class';
  END IF;

  -- 5. Deduct credit
  UPDATE credits
  SET remaining_amount = remaining_amount - 1
  WHERE id = v_credit.id;

  -- 6. Insert booking (credit-based: cancellation_id is NULL)
  INSERT INTO makeup_bookings (
    cancellation_id, credit_id, student_id, host_class_id,
    session_number, session_date, status
  ) VALUES (
    NULL, v_credit.id, p_student_id, p_class_id,
    1, p_session_date, 'booked'
  ) RETURNING id INTO v_booking_id;

  -- 7. Log
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(v_caller, v_admin_id),
    'credit_makeup_booked',
    jsonb_build_object(
      'booking_id', v_booking_id,
      'student_id', p_student_id,
      'class_id', p_class_id,
      'credit_id', v_credit.id,
      'session_date', p_session_date
    )
  );

  RETURN v_booking_id;
END;
$$;
