-- Migration 00040: Auto-book makeup from waitlist + enrollment waitlist fixes
-- 1. Converts makeup waitlist from notify-all to auto-book pattern
-- 2. Fixes auto_enroll_from_waitlist: admin_logs columns, start_date guard, uq_student_class
-- 3. Replaces absolute uq_student_class UNIQUE with partial index (active/pending only)

-- =============================================================================
-- 0. Fix uq_student_class: allow re-enrollment after cancel/refund
--    Old: UNIQUE (student_id, class_id) — blocks ALL duplicates
--    New: partial unique index on (student_id, class_id) WHERE status IN ('pending','active')
-- =============================================================================
-- Drop constraint (try both names — rename may or may not have applied)
-- Use DROP CONSTRAINT first, then DROP INDEX as fallback, since Postgres UNIQUE
-- constraints have both a constraint and a backing index.
DO $$ BEGIN
  ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS uq_student_class;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS uq_student_cohort;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
-- Fallback: drop the backing index directly (covers cases where constraint was
-- already dropped but index remains, or where name differs)
DROP INDEX IF EXISTS public.uq_student_class;
DROP INDEX IF EXISTS public.uq_student_cohort;

-- Partial unique index: only one active/pending enrollment per student per class
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_class_active
  ON public.enrollments (student_id, class_id)
  WHERE status IN ('pending', 'active');

-- =============================================================================
-- 1. Fix auto_enroll_from_waitlist RPC
--    - Removed start_date guard (mid-course drops should auto-enroll next student)
--    - Fixed admin_logs column names
--    - On unique_violation: try UPDATE existing canceled row instead of giving up
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

    -- Check 3: re-enrollment limit
    SELECT COUNT(*) INTO v_reenroll_count
    FROM enrollments enr
    WHERE enr.student_id = v_entry.student_id
      AND enr.course_id IN (
        SELECT id FROM courses WHERE subject = v_class.subject
      )
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
    -- If a canceled/refunded enrollment already exists for this student+class,
    -- re-activate it instead of inserting a new row.
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
      -- A row already exists for this student+class (canceled/refunded).
      -- Re-activate it.
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

-- =============================================================================
-- 2. auto_book_makeup_from_waitlist RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_book_makeup_from_waitlist(
  p_host_class_id UUID,
  p_session_number INTEGER
)
RETURNS TABLE(booking_id UUID, student_id UUID, waitlist_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_class RECORD;
  v_host_course RECORD;
  v_entry RECORD;
  v_cancel RECORD;
  v_active_count INTEGER;
  v_makeup_count INTEGER;
  v_host_session_date DATE;
  v_orig_week_start DATE;
  v_host_week_start DATE;
  v_booking_id UUID;
  v_admin_id UUID;
BEGIN
  -- Get an admin user for logging
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  -- Lock and fetch host class
  SELECT c.id, c.capacity, c.course_id, c.group_size_type, c.active,
         c.meeting_day, c.meeting_time
  INTO v_host_class
  FROM classes c
  WHERE c.id = p_host_class_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT v_host_class.active THEN
    RETURN;
  END IF;

  -- Fetch course for session date computation
  SELECT * INTO v_host_course
  FROM courses
  WHERE id = v_host_class.course_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Compute host session date
  v_host_session_date := compute_session_date(
    v_host_course.start_date, v_host_class.meeting_day, p_session_number
  );

  -- Session must be in the future
  IF v_host_session_date <= CURRENT_DATE THEN
    RETURN;
  END IF;

  -- Initial capacity check
  SELECT COUNT(*) INTO v_active_count
  FROM enrollments enr
  WHERE enr.class_id = p_host_class_id
    AND enr.status = 'active';

  SELECT COUNT(*) INTO v_makeup_count
  FROM makeup_bookings
  WHERE host_class_id = p_host_class_id
    AND session_number = p_session_number
    AND status = 'booked';

  IF (v_active_count + v_makeup_count) >= v_host_class.capacity THEN
    RETURN;
  END IF;

  -- Loop through waiting entries in FIFO order
  FOR v_entry IN
    SELECT mw.id, mw.student_id, mw.cancellation_id, mw.session_date
    FROM makeup_waitlist mw
    WHERE mw.host_class_id = p_host_class_id
      AND mw.session_number = p_session_number
      AND mw.status = 'waiting'
    ORDER BY mw.created_at ASC
    FOR UPDATE OF mw SKIP LOCKED
  LOOP
    -- Fetch the cancellation
    SELECT sc.id, sc.student_id, sc.course_id, sc.class_id,
           sc.session_number, sc.session_date, sc.group_size_type, sc.status
    INTO v_cancel
    FROM session_cancellations sc
    WHERE sc.id = v_entry.cancellation_id;

    IF NOT FOUND THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Cancellation must still be in 'cancelled' status
    IF v_cancel.status <> 'cancelled' THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Not available for 1:1
    IF v_cancel.group_size_type = 'one_on_one' THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Same course check
    IF v_host_class.course_id <> v_cancel.course_id THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Same group size check
    IF v_host_class.group_size_type <> v_cancel.group_size_type THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Different class check
    IF v_host_class.id = v_cancel.class_id THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Same week check (Sunday-based)
    v_orig_week_start := v_cancel.session_date - EXTRACT(DOW FROM v_cancel.session_date)::INTEGER;
    v_host_week_start := v_host_session_date - EXTRACT(DOW FROM v_host_session_date)::INTEGER;

    IF v_orig_week_start <> v_host_week_start THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Re-check capacity (belt-and-suspenders)
    SELECT COUNT(*) INTO v_makeup_count
    FROM makeup_bookings
    WHERE host_class_id = p_host_class_id
      AND session_number = p_session_number
      AND status = 'booked';

    IF (v_active_count + v_makeup_count) >= v_host_class.capacity THEN
      RETURN;
    END IF;

    -- All checks passed — attempt insert
    BEGIN
      INSERT INTO makeup_bookings (
        cancellation_id, student_id, host_class_id, host_course_id,
        session_number, session_date, status
      ) VALUES (
        v_entry.cancellation_id, v_cancel.student_id, p_host_class_id,
        v_host_class.course_id, v_cancel.session_number, v_host_session_date, 'booked'
      )
      RETURNING id INTO v_booking_id;
    EXCEPTION WHEN unique_violation THEN
      -- Race condition: cancellation already booked or student already has booking
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END;

    -- Update cancellation to rescheduled
    UPDATE session_cancellations
    SET status = 'rescheduled'
    WHERE id = v_entry.cancellation_id;

    -- Mark waitlist entry as booked
    UPDATE makeup_waitlist
    SET status = 'booked'
    WHERE id = v_entry.id;

    -- Log to admin_logs
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      v_admin_id,
      'auto_book_makeup_from_waitlist',
      jsonb_build_object(
        'booking_id', v_booking_id,
        'cancellation_id', v_entry.cancellation_id,
        'student_id', v_cancel.student_id,
        'host_class_id', p_host_class_id,
        'session_number', p_session_number,
        'session_date', v_host_session_date
      )
    );

    -- Return result
    booking_id := v_booking_id;
    student_id := v_cancel.student_id;
    waitlist_id := v_entry.id;
    RETURN NEXT;
    RETURN;
  END LOOP;

  -- No eligible student found
  RETURN;
END;
$$;
