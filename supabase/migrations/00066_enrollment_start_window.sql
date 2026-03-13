-- Add enrollment start window columns to classes (SG/1:1 only).
-- Admin sets a window [enrollment_window_start, enrollment_window_end].
-- Students pick their start date within this window at enrollment time.

-- 1. Add columns
ALTER TABLE classes
  ADD COLUMN enrollment_window_start DATE,
  ADD COLUMN enrollment_window_end DATE;

-- 2. Recreate reserve_seat with p_student_start_date parameter
CREATE OR REPLACE FUNCTION public.reserve_seat(
  p_student_id UUID,
  p_slot_1_class_id UUID,
  p_slot_2_class_id UUID DEFAULT NULL,
  p_agreement_version TEXT DEFAULT NULL,
  p_agreement_timestamp TIMESTAMPTZ DEFAULT NULL,
  p_pay_later BOOLEAN DEFAULT false,
  p_student_start_date DATE DEFAULT NULL
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
         cl.enrollment_window_start, cl.enrollment_window_end
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

  -- 1:1 classes: reject slot 2 (1x/wk only)
  IF v_slot1.group_size_type = 'one_on_one' AND p_slot_2_class_id IS NOT NULL THEN
    RAISE EXCEPTION '1:1 classes only allow a single weekly slot';
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
    -- SG/1:1: use student-chosen date if provided, else CURRENT_DATE
    IF p_student_start_date IS NOT NULL THEN
      -- Validate against enrollment window if set
      IF v_slot1.enrollment_window_start IS NOT NULL
         AND p_student_start_date < v_slot1.enrollment_window_start THEN
        RAISE EXCEPTION 'Start date cannot be before %', v_slot1.enrollment_window_start;
      END IF;
      IF v_slot1.enrollment_window_end IS NOT NULL
         AND p_student_start_date > v_slot1.enrollment_window_end THEN
        RAISE EXCEPTION 'Start date cannot be after %', v_slot1.enrollment_window_end;
      END IF;
      v_start_date := p_student_start_date;
    ELSE
      v_start_date := CURRENT_DATE;
    END IF;
    v_end_date := v_start_date + INTERVAL '1 month';
  END IF;

  -- Create enrollment
  INSERT INTO enrollments (
    student_id, class_id, slot_1_class_id, slot_2_class_id,
    status, payment_status, payment_deadline,
    student_start_date, student_end_date,
    agreement_version, agreement_timestamp
  ) VALUES (
    p_student_id, p_slot_1_class_id, p_slot_1_class_id, p_slot_2_class_id,
    CASE WHEN p_pay_later THEN 'active' ELSE 'pending' END,
    'unpaid', v_start_date + INTERVAL '7 days',
    v_start_date, v_end_date,
    p_agreement_version, p_agreement_timestamp
  )
  RETURNING id INTO v_enrollment_id;

  -- Log the enrollment
  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
    'enrollment_created',
    jsonb_build_object(
      'enrollment_id', v_enrollment_id,
      'student_id', p_student_id,
      'slot_1_class_id', p_slot_1_class_id,
      'slot_2_class_id', p_slot_2_class_id,
      'pay_later', p_pay_later,
      'student_start_date', v_start_date
    )
  );

  RETURN v_enrollment_id;
END;
$$;
