-- Migration 00091: SG fixes
--   (A) Widen rolling enrollment end-date so every scheduled session fits
--       inside [student_start_date, student_end_date] regardless of start DOW.
--       Old: 4th Saturday after start   → start + ((6-DOW+6)%7)+1 + 21  (22–28 days)
--       Problem: single-slot with meeting_day = (startDOW - 1) puts session 4
--                at start + 27 days, potentially past end_date.
--       New: a flat 35 days after start (5 full weeks). Covers every weekly
--            4-session sequence regardless of meeting_day and keeps semantics
--            simple. Payment deadline (start + 7d) unchanged.
--
--   (B) SG waitlist auto-enroll: when picking two open preferred slots, require
--       they are on distinct meeting_days. Prevents converting a waitlist entry
--       into a same-day dual-slot enrollment.

-- =============================================================================
-- A. reserve_seat — flat 35-day window
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
  IF p_agreement_version IS NULL OR p_agreement_timestamp IS NULL THEN
    RAISE EXCEPTION 'Agreement must be accepted before enrollment';
  END IF;

  SELECT cl.id, cl.capacity, cl.active, cl.group_size_type, cl.meeting_day,
         cl.name, cl.class_start_date, cl.class_end_date
  INTO v_slot1
  FROM classes cl
  WHERE cl.id = p_slot_1_class_id
  FOR UPDATE OF cl;

  IF NOT FOUND THEN RAISE EXCEPTION 'Slot 1 class not found'; END IF;
  IF NOT v_slot1.active THEN RAISE EXCEPTION 'Slot 1 class is not active'; END IF;

  IF v_slot1.group_size_type = 'large' THEN
    IF v_slot1.class_start_date IS NOT NULL AND v_slot1.class_start_date <= CURRENT_DATE THEN
      RAISE EXCEPTION 'Large group class has already started — enrollment is closed';
    END IF;
  END IF;

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

  IF p_slot_2_class_id IS NOT NULL THEN
    SELECT cl.id, cl.capacity, cl.active, cl.group_size_type, cl.meeting_day,
           cl.name, cl.class_start_date, cl.class_end_date
    INTO v_slot2
    FROM classes cl
    WHERE cl.id = p_slot_2_class_id
    FOR UPDATE OF cl;

    IF NOT FOUND THEN RAISE EXCEPTION 'Slot 2 class not found'; END IF;
    IF NOT v_slot2.active THEN RAISE EXCEPTION 'Slot 2 class is not active'; END IF;
    IF v_slot1.group_size_type != v_slot2.group_size_type THEN
      RAISE EXCEPTION 'Both slots must have the same group size type';
    END IF;
    IF p_slot_1_class_id = p_slot_2_class_id THEN
      RAISE EXCEPTION 'Slot 1 and Slot 2 must be different classes';
    END IF;

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

  IF p_slot_3_class_id IS NOT NULL THEN
    SELECT cl.id, cl.capacity, cl.active, cl.group_size_type, cl.meeting_day,
           cl.name, cl.class_start_date, cl.class_end_date
    INTO v_slot3
    FROM classes cl
    WHERE cl.id = p_slot_3_class_id
    FOR UPDATE OF cl;

    IF NOT FOUND THEN RAISE EXCEPTION 'Slot 3 class not found'; END IF;
    IF NOT v_slot3.active THEN RAISE EXCEPTION 'Slot 3 class is not active'; END IF;
    IF v_slot1.group_size_type != v_slot3.group_size_type THEN
      RAISE EXCEPTION 'All slots must have the same group size type';
    END IF;
    IF p_slot_3_class_id = p_slot_1_class_id OR p_slot_3_class_id = p_slot_2_class_id THEN
      RAISE EXCEPTION 'Slot 3 must be a different class from slots 1 and 2';
    END IF;

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
    -- Flat 35 days (5 weeks) — covers every weekly 4-session sequence
    v_end_date := v_start_date + 35;
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
-- A'. auto_enroll_from_waitlist (LG) — also flat 35-day window for the SG/1:1
--     branch (kept for correctness; LG path still uses class dates).
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

  SELECT cl.id, cl.capacity, cl.active, cl.meeting_day, cl.meeting_time,
         cl.group_size_type,
         cl.class_start_date, cl.class_end_date
  INTO v_class
  FROM classes cl
  WHERE cl.id = p_class_id
  FOR UPDATE OF cl;

  IF NOT FOUND OR NOT v_class.active THEN RETURN; END IF;

  IF v_class.group_size_type = 'large' THEN
    IF v_class.class_start_date IS NOT NULL AND v_class.class_start_date <= CURRENT_DATE THEN RETURN; END IF;
    IF v_class.class_end_date IS NOT NULL AND v_class.class_end_date < CURRENT_DATE THEN RETURN; END IF;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM enrollments enr
  WHERE (enr.slot_1_class_id = p_class_id
         OR enr.slot_2_class_id = p_class_id
         OR enr.slot_3_class_id = p_class_id
         OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
    AND enr.status IN ('pending', 'active');

  IF v_current_count >= v_class.capacity THEN RETURN; END IF;

  FOR v_entry IN
    SELECT w.id, w.student_id, w.agreement_version, w.agreement_timestamp
    FROM waitlist w
    WHERE w.class_id = p_class_id
      AND w.status = 'waiting'
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    IF v_entry.agreement_version IS NULL OR v_entry.agreement_timestamp IS NULL THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

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

    SELECT COUNT(*) INTO v_conflict_count
    FROM enrollments enr
    JOIN classes c1 ON c1.id = COALESCE(enr.slot_1_class_id, enr.class_id)
    WHERE enr.student_id = v_entry.student_id
      AND enr.status IN ('pending', 'active')
      AND c1.meeting_day = v_class.meeting_day
      AND c1.meeting_time = v_class.meeting_time;

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

    IF v_class.group_size_type = 'large' THEN
      v_start_date := v_class.class_start_date;
      v_end_date := v_class.class_end_date;
    ELSE
      v_start_date := CURRENT_DATE;
      v_end_date := v_start_date + 35;
    END IF;

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

    UPDATE waitlist SET status = 'converted' WHERE id = v_entry.id;

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

    SELECT COUNT(*) INTO v_current_count
    FROM enrollments enr
    WHERE (enr.slot_1_class_id = p_class_id
           OR enr.slot_2_class_id = p_class_id
           OR enr.slot_3_class_id = p_class_id
           OR (enr.slot_1_class_id IS NULL AND enr.class_id = p_class_id))
      AND enr.status IN ('pending', 'active');

    IF v_current_count >= v_class.capacity THEN EXIT; END IF;
  END LOOP;
END;
$$;

-- =============================================================================
-- B. auto_enroll_sg_from_waitlist — require distinct meeting_days across the
--    two picked slots. Everything else unchanged.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_enroll_sg_from_waitlist(p_class_id UUID)
RETURNS TABLE(student_id UUID, enrollment_id UUID, waitlist_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_admin_id UUID;
  v_enrollment_id UUID;
  v_open_slots UUID[];
  v_pref_id UUID;
  v_current_count INTEGER;
  v_capacity INTEGER;
  v_dup_count INTEGER;
  v_meeting_day TEXT;
  v_slot1 UUID;
  v_slot2 UUID;
  v_slot1_day TEXT;
  v_slot2_day TEXT;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  FOR v_entry IN
    SELECT w.id, w.student_id, w.agreement_version, w.agreement_timestamp,
           w.preferred_class_ids
    FROM waitlist w
    WHERE w.class_id IS NULL
      AND w.preferred_class_ids @> ARRAY[p_class_id]
      AND w.status = 'waiting'
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    IF v_entry.agreement_version IS NULL OR v_entry.agreement_timestamp IS NULL THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_dup_count
    FROM enrollments enr
    WHERE enr.student_id = v_entry.student_id
      AND enr.status IN ('pending', 'active')
      AND (
        enr.slot_1_class_id = ANY(v_entry.preferred_class_ids)
        OR enr.slot_2_class_id = ANY(v_entry.preferred_class_ids)
      );

    IF v_dup_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Collect preferred classes that are active AND have capacity
    v_open_slots := ARRAY[]::UUID[];
    FOREACH v_pref_id IN ARRAY v_entry.preferred_class_ids LOOP
      SELECT cl.capacity INTO v_capacity
      FROM classes cl
      WHERE cl.id = v_pref_id AND cl.active = true;

      IF NOT FOUND THEN CONTINUE; END IF;

      SELECT COUNT(*) INTO v_current_count
      FROM enrollments enr
      WHERE (enr.slot_1_class_id = v_pref_id OR enr.slot_2_class_id = v_pref_id
             OR (enr.slot_1_class_id IS NULL AND enr.class_id = v_pref_id))
        AND enr.status IN ('pending', 'active');

      IF v_current_count < v_capacity THEN
        v_open_slots := array_append(v_open_slots, v_pref_id);
      END IF;
    END LOOP;

    IF array_length(v_open_slots, 1) IS NULL OR array_length(v_open_slots, 1) < 2 THEN
      CONTINUE;
    END IF;

    -- Pick the first open slot as slot 1, then find the first subsequent open
    -- slot on a DIFFERENT meeting_day. Requires 2 distinct days.
    v_slot1 := v_open_slots[1];
    SELECT cl.meeting_day INTO v_slot1_day FROM classes cl WHERE cl.id = v_slot1;

    v_slot2 := NULL;
    FOR i IN 2 .. COALESCE(array_length(v_open_slots, 1), 0) LOOP
      SELECT cl.meeting_day INTO v_meeting_day FROM classes cl WHERE cl.id = v_open_slots[i];
      IF v_meeting_day IS DISTINCT FROM v_slot1_day THEN
        v_slot2 := v_open_slots[i];
        v_slot2_day := v_meeting_day;
        EXIT;
      END IF;
    END LOOP;

    -- No distinct-day partner available → leave entry waiting for the next dispatch.
    IF v_slot2 IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_enrollment_id := reserve_seat(
        p_student_id := v_entry.student_id,
        p_slot_1_class_id := v_slot1,
        p_slot_2_class_id := v_slot2,
        p_agreement_version := v_entry.agreement_version,
        p_agreement_timestamp := v_entry.agreement_timestamp,
        p_pay_later := true
      );
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    UPDATE waitlist SET status = 'converted' WHERE id = v_entry.id;

    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      v_admin_id,
      'waitlist_sg_auto_enrolled',
      jsonb_build_object(
        'enrollment_id', v_enrollment_id,
        'student_id', v_entry.student_id,
        'slot_1_class_id', v_slot1,
        'slot_2_class_id', v_slot2,
        'waitlist_id', v_entry.id
      )
    );

    student_id := v_entry.student_id;
    enrollment_id := v_enrollment_id;
    waitlist_id := v_entry.id;
    RETURN NEXT;
    RETURN;
  END LOOP;

  RETURN;
END;
$$;
