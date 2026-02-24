-- Fix: re-enrollment limit should be per course, not per subject.
-- A student taking "DSAT RW Essentials" 3 times should NOT block "DSAT RW Advanced".
-- Affects: check_reenroll_limit trigger, reserve_seat RPC, auto_enroll_from_waitlist RPC.

-- =============================================================================
-- 1. Fix the trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION check_reenroll_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_max_reenroll INTEGER;
  v_count INTEGER;
BEGIN
  SELECT m.max_reenroll
  INTO v_max_reenroll
  FROM courses m
  WHERE m.id = NEW.course_id;

  SELECT COUNT(*)
  INTO v_count
  FROM enrollments e
  WHERE e.student_id = NEW.student_id
    AND e.course_id = NEW.course_id
    AND e.status IN ('active', 'completed');

  IF v_count >= v_max_reenroll THEN
    RAISE EXCEPTION 'Student has reached re-enrollment limit (%) for this course', v_max_reenroll;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. Fix reserve_seat RPC (re-enrollment check: course_id instead of subject)
-- =============================================================================
CREATE OR REPLACE FUNCTION reserve_seat(
  p_student_id UUID,
  p_class_id UUID,
  p_course_id UUID,
  p_agreement_version TEXT,
  p_agreement_timestamp TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity INTEGER;
  v_current_count INTEGER;
  v_enrollment_id UUID;
  v_course_start DATE;
  v_max_reenroll INTEGER;
  v_reenroll_count INTEGER;
  v_class_course_id UUID;
  v_class_active BOOLEAN;
BEGIN
  -- 0. Validate agreement fields
  IF p_agreement_version IS NULL OR p_agreement_timestamp IS NULL THEN
    RAISE EXCEPTION 'Agreement must be signed before enrollment';
  END IF;

  -- 1. Lock the class row to prevent concurrent modifications
  SELECT c.capacity, c.course_id, c.active, m.start_date, m.max_reenroll
  INTO v_capacity, v_class_course_id, v_class_active, v_course_start, v_max_reenroll
  FROM classes c
  JOIN courses m ON m.id = c.course_id
  WHERE c.id = p_class_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  -- 1a. Validate class belongs to the specified course
  IF v_class_course_id != p_course_id THEN
    RAISE EXCEPTION 'Class does not belong to the specified course';
  END IF;

  -- 1b. Check class is active
  IF NOT v_class_active THEN
    RAISE EXCEPTION 'Class is not active';
  END IF;

  -- 2. Check course hasn't started
  IF v_course_start <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot enroll: course has already started';
  END IF;

  -- 3. Count active + pending enrollments
  SELECT COUNT(*)
  INTO v_current_count
  FROM enrollments
  WHERE class_id = p_class_id
    AND status IN ('pending', 'active');

  -- 4. Check capacity
  IF v_current_count >= v_capacity THEN
    RAISE EXCEPTION 'Class is full (% / %)', v_current_count, v_capacity;
  END IF;

  -- 5. Check re-enrollment limit per course (not subject)
  SELECT COUNT(*)
  INTO v_reenroll_count
  FROM enrollments e
  WHERE e.student_id = p_student_id
    AND e.course_id = p_course_id
    AND e.status IN ('active', 'completed');

  IF v_reenroll_count >= v_max_reenroll THEN
    RAISE EXCEPTION 'Re-enrollment limit reached (% of % for this course)', v_reenroll_count, v_max_reenroll;
  END IF;

  -- 6. Insert enrollment with status = 'pending'
  INSERT INTO enrollments (
    student_id, class_id, course_id,
    status, agreement_version, agreement_timestamp
  )
  VALUES (
    p_student_id, p_class_id, p_course_id,
    'pending', p_agreement_version, p_agreement_timestamp
  )
  RETURNING id INTO v_enrollment_id;

  RETURN v_enrollment_id;
END;
$$;

-- =============================================================================
-- 3. Fix auto_enroll_from_waitlist RPC (re-enrollment check: course_id instead of subject)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_enroll_from_waitlist(p_class_id UUID)
RETURNS TABLE(enrollment_id UUID, student_id UUID, waitlist_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_class RECORD;
  v_course RECORD;
  v_dup_count INTEGER;
  v_conflict_count INTEGER;
  v_reenroll_count INTEGER;
  v_current_count INTEGER;
  v_enrollment_id UUID;
  v_admin_id UUID;
BEGIN
  -- Get an admin user for logging
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  -- Lock and fetch class info
  SELECT c.id, c.capacity, c.course_id, c.active, c.meeting_day, c.meeting_time,
         m.start_date, m.max_reenroll, m.subject
  INTO v_class
  FROM classes c
  JOIN courses m ON m.id = c.course_id
  WHERE c.id = p_class_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT v_class.active THEN
    RETURN;
  END IF;

  -- Note: no start_date guard — mid-course drops should auto-enroll next waitlisted student.
  -- Course end_date check: don't auto-enroll if course already ended.
  IF EXISTS (
    SELECT 1 FROM courses WHERE id = v_class.course_id AND end_date < CURRENT_DATE
  ) THEN
    RETURN;
  END IF;

  -- Check there is actually a seat available
  SELECT COUNT(*) INTO v_current_count
  FROM enrollments enr
  WHERE enr.class_id = p_class_id
    AND enr.status IN ('pending', 'active');

  IF v_current_count >= v_class.capacity THEN
    RETURN;
  END IF;

  -- Loop through waiting entries in FIFO order, skipping ineligible
  FOR v_entry IN
    SELECT w.id, w.student_id, w.agreement_version, w.agreement_timestamp
    FROM waitlist w
    WHERE w.class_id = p_class_id
      AND w.status = 'waiting'
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    -- Skip entries without agreement (legacy rows before this migration)
    IF v_entry.agreement_version IS NULL OR v_entry.agreement_timestamp IS NULL THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check 1: no duplicate enrollment in this class
    SELECT COUNT(*) INTO v_dup_count
    FROM enrollments enr
    WHERE enr.student_id = v_entry.student_id
      AND enr.class_id = p_class_id
      AND enr.status IN ('pending', 'active');

    IF v_dup_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check 2: no duplicate enrollment in same course (any class)
    SELECT COUNT(*) INTO v_dup_count
    FROM enrollments enr
    WHERE enr.student_id = v_entry.student_id
      AND enr.course_id = v_class.course_id
      AND enr.status IN ('pending', 'active');

    IF v_dup_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check 3: re-enrollment limit per course (not subject)
    SELECT COUNT(*) INTO v_reenroll_count
    FROM enrollments enr
    WHERE enr.student_id = v_entry.student_id
      AND enr.course_id = v_class.course_id
      AND enr.status IN ('active', 'completed');

    IF v_reenroll_count >= v_class.max_reenroll THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check 4: time conflict
    SELECT COUNT(*) INTO v_conflict_count
    FROM enrollments enr
    JOIN classes cl ON cl.id = enr.class_id
    WHERE enr.student_id = v_entry.student_id
      AND enr.status IN ('pending', 'active')
      AND cl.meeting_day = v_class.meeting_day
      AND cl.meeting_time = v_class.meeting_time;

    IF v_conflict_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- All checks passed — attempt insert
    BEGIN
      INSERT INTO enrollments (
        student_id, class_id, course_id,
        status, agreement_version, agreement_timestamp
      )
      VALUES (
        v_entry.student_id, p_class_id, v_class.course_id,
        'active', v_entry.agreement_version, v_entry.agreement_timestamp
      )
      RETURNING id INTO v_enrollment_id;
    EXCEPTION WHEN unique_violation THEN
      -- A row already exists for this student+class (canceled/refunded). Re-activate it.
      UPDATE enrollments enr
      SET status = 'active',
          agreement_version = v_entry.agreement_version,
          agreement_timestamp = v_entry.agreement_timestamp
      WHERE enr.student_id = v_entry.student_id
        AND enr.class_id = p_class_id
        AND enr.status IN ('canceled', 'refunded')
      RETURNING enr.id INTO v_enrollment_id;

      IF v_enrollment_id IS NULL THEN
        UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
        CONTINUE;
      END IF;
    END;

    -- Mark waitlist entry as converted
    UPDATE waitlist
    SET status = 'converted'
    WHERE id = v_entry.id;

    -- Log the auto-enrollment
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      v_admin_id,
      'auto_enroll_from_waitlist',
      jsonb_build_object(
        'enrollment_id', v_enrollment_id,
        'student_id', v_entry.student_id,
        'class_id', p_class_id,
        'waitlist_id', v_entry.id
      )
    );

    -- Return result
    enrollment_id := v_enrollment_id;
    student_id := v_entry.student_id;
    waitlist_id := v_entry.id;
    RETURN NEXT;
    RETURN;
  END LOOP;

  -- No eligible student found
  RETURN;
END;
$$;
