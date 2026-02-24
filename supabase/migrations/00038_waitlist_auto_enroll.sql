-- Migration 00038: Waitlist auto-enroll
-- When a seat opens, auto-enroll the next eligible waitlisted student instead of
-- merely notifying them. Requires agreement fields on waitlist rows so reserve_seat
-- can be satisfied.

-- =============================================================================
-- 1. Add agreement columns to waitlist table
-- =============================================================================
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS agreement_version TEXT,
  ADD COLUMN IF NOT EXISTS agreement_timestamp TIMESTAMPTZ;

-- =============================================================================
-- 2. auto_enroll_from_waitlist RPC
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
BEGIN
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

  -- Check course hasn't started
  IF v_class.start_date <= CURRENT_DATE THEN
    RETURN;
  END IF;

  -- Check there is actually a seat available
  SELECT COUNT(*) INTO v_current_count
  FROM enrollments
  WHERE class_id = p_class_id
    AND status IN ('pending', 'active');

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
      -- Mark as expired so they re-join with agreement
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check 1: no duplicate enrollment in this class
    SELECT COUNT(*) INTO v_dup_count
    FROM enrollments
    WHERE student_id = v_entry.student_id
      AND class_id = p_class_id
      AND status IN ('pending', 'active');

    IF v_dup_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check 2: no duplicate enrollment in same course (any class)
    SELECT COUNT(*) INTO v_dup_count
    FROM enrollments
    WHERE student_id = v_entry.student_id
      AND course_id = v_class.course_id
      AND status IN ('pending', 'active');

    IF v_dup_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check 3: re-enrollment limit
    SELECT COUNT(*) INTO v_reenroll_count
    FROM enrollments e
    WHERE e.student_id = v_entry.student_id
      AND e.course_id IN (
        SELECT id FROM courses WHERE subject = v_class.subject
      )
      AND e.status IN ('active', 'completed');

    IF v_reenroll_count >= v_class.max_reenroll THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check 4: time conflict
    SELECT COUNT(*) INTO v_conflict_count
    FROM enrollments e
    JOIN classes cl ON cl.id = e.class_id
    WHERE e.student_id = v_entry.student_id
      AND e.status IN ('pending', 'active')
      AND cl.meeting_day = v_class.meeting_day
      AND cl.meeting_time = v_class.meeting_time;

    IF v_conflict_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- All checks passed — attempt insert (handle race condition on unique constraint)
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
      -- Race condition: student was enrolled between our check and insert
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END;

    -- Mark waitlist entry as converted
    UPDATE waitlist
    SET status = 'converted'
    WHERE id = v_entry.id;

    -- Log the auto-enrollment
    INSERT INTO admin_logs (action, target_table, target_id, details, performed_by)
    VALUES (
      'auto_enroll_from_waitlist',
      'enrollments',
      v_enrollment_id,
      jsonb_build_object(
        'student_id', v_entry.student_id,
        'class_id', p_class_id,
        'waitlist_id', v_entry.id
      ),
      '00000000-0000-0000-0000-000000000000'  -- system action
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
