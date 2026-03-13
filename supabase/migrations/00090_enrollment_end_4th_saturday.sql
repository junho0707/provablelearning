-- Migration: Change enrollment end date from start + 1 month to the 4th Saturday after start date.
-- Formula: next Saturday strictly after start_date, then + 21 days (3 more weeks).
-- Examples:
--   Mon Mar 31 → Sat Apr 26 (26 days)
--   Wed Apr 2  → Sat Apr 26 (24 days)
--   Sat Apr 5  → Sat May 3  (28 days)
--   Sun Apr 6  → Sat May 3  (27 days)

-- Helper: compute the 4th Saturday after a given date.
-- DOW: Sun=0, Mon=1, ..., Sat=6
-- days_to_next_sat = ((6 - DOW + 6) % 7) + 1  → always 1..7, Sat→7
-- 4th Saturday = start + days_to_next_sat + 21

-- =============================================================================
-- 1. reserve_seat — update end date calculation
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
  v_dow INTEGER;
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
    -- End date = 4th Saturday after start date
    v_dow := EXTRACT(DOW FROM v_start_date)::int;
    v_end_date := v_start_date + ((6 - v_dow + 6) % 7 + 1) + 21;
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
-- 2. auto_enroll_from_waitlist — update end date calculation
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
  v_dow INTEGER;
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
      -- End date = 4th Saturday after start date
      v_dow := EXTRACT(DOW FROM v_start_date)::int;
      v_end_date := v_start_date + ((6 - v_dow + 6) % 7 + 1) + 21;
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
