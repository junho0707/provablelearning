-- Migration 00045: Add group_size_type to makeup_sessions
-- Scopes dedicated makeup sessions by group size (small/medium) so students
-- only see makeup sessions matching their enrollment's group size.

-- =============================================================================
-- 1. Add group_size_type column
-- =============================================================================
ALTER TABLE public.makeup_sessions
  ADD COLUMN IF NOT EXISTS group_size_type group_size_type NOT NULL DEFAULT 'small';

ALTER TABLE public.makeup_sessions
  ALTER COLUMN group_size_type DROP DEFAULT;

-- =============================================================================
-- 2. Update unique constraint to include group_size_type
-- =============================================================================
ALTER TABLE public.makeup_sessions
  DROP CONSTRAINT IF EXISTS uq_makeup_session_subject_level_date_time;

ALTER TABLE public.makeup_sessions
  ADD CONSTRAINT uq_makeup_session_subject_level_gst_date_time
  UNIQUE (subject, level, group_size_type, session_date, session_time);

-- =============================================================================
-- 3. Update active index to include group_size_type
-- =============================================================================
DROP INDEX IF EXISTS idx_makeup_sessions_active;

CREATE INDEX idx_makeup_sessions_active
  ON public.makeup_sessions (subject, level, group_size_type, session_date)
  WHERE active = true;

-- =============================================================================
-- 4. Update book_dedicated_makeup RPC — validate group_size_type match
-- =============================================================================
CREATE OR REPLACE FUNCTION public.book_dedicated_makeup(
  p_cancellation_id UUID,
  p_makeup_session_id UUID,
  p_booked_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancellation RECORD;
  v_student RECORD;
  v_makeup_session RECORD;
  v_course RECORD;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_booked_count INTEGER;
  v_booking_id UUID;
BEGIN
  v_caller := COALESCE(p_booked_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Lock cancellation row
  SELECT * INTO v_cancellation
  FROM session_cancellations
  WHERE id = p_cancellation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation not found';
  END IF;

  -- 2. Validate status
  IF v_cancellation.status != 'cancelled' THEN
    RAISE EXCEPTION 'Cancellation is not in cancelled status';
  END IF;

  -- 3. Only small/medium (dedicated sessions)
  IF v_cancellation.group_size_type NOT IN ('small', 'medium') THEN
    RAISE EXCEPTION 'Dedicated makeup sessions are only for small/medium groups';
  END IF;

  -- 4. Auth check
  SELECT * INTO v_student FROM students WHERE id = v_cancellation.student_id;

  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = v_caller AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin
     AND v_student.user_id != v_caller
     AND v_student.parent_id != v_caller
  THEN
    RAISE EXCEPTION 'Not authorized to book this makeup';
  END IF;

  -- 5. Fetch makeup session
  SELECT * INTO v_makeup_session
  FROM makeup_sessions
  WHERE id = p_makeup_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Makeup session not found';
  END IF;

  IF NOT v_makeup_session.active THEN
    RAISE EXCEPTION 'Makeup session is not active';
  END IF;

  -- 6. Subject+level match: cancellation's course must match
  SELECT * INTO v_course FROM courses WHERE id = v_cancellation.course_id;

  IF v_course.subject != v_makeup_session.subject OR v_course.level != v_makeup_session.level THEN
    RAISE EXCEPTION 'Makeup session subject/level does not match the cancelled course';
  END IF;

  -- 6b. Group size type must match
  IF v_cancellation.group_size_type != v_makeup_session.group_size_type THEN
    RAISE EXCEPTION 'Makeup session group size does not match the cancellation group size';
  END IF;

  -- 7. Must be before credit deadline and in the future
  IF v_makeup_session.session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book a past or current-day makeup session';
  END IF;

  IF v_cancellation.credit_deadline IS NOT NULL
     AND (v_makeup_session.session_date + v_makeup_session.session_time) > v_cancellation.credit_deadline
  THEN
    RAISE EXCEPTION 'Makeup session is after the credit deadline';
  END IF;

  -- 8. Capacity check
  SELECT COUNT(*) INTO v_booked_count
  FROM makeup_bookings mb
  WHERE mb.makeup_session_id = p_makeup_session_id
    AND mb.status = 'booked';

  IF v_booked_count >= v_makeup_session.capacity THEN
    RAISE EXCEPTION 'Makeup session is full';
  END IF;

  -- 9. Insert booking
  INSERT INTO makeup_bookings (
    cancellation_id, student_id, host_class_id, host_course_id,
    makeup_session_id, session_number, session_date, status
  ) VALUES (
    p_cancellation_id, v_cancellation.student_id, NULL, NULL,
    p_makeup_session_id, v_cancellation.session_number, v_makeup_session.session_date, 'booked'
  ) RETURNING id INTO v_booking_id;

  -- 10. Update cancellation status
  UPDATE session_cancellations
  SET status = 'rescheduled'
  WHERE id = p_cancellation_id;

  -- 11. Log
  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'dedicated_makeup_booked',
    jsonb_build_object(
      'booking_id', v_booking_id,
      'cancellation_id', p_cancellation_id,
      'student_id', v_cancellation.student_id,
      'makeup_session_id', p_makeup_session_id,
      'session_number', v_cancellation.session_number,
      'session_date', v_makeup_session.session_date
    )
  );

  RETURN v_booking_id;
END;
$$;

-- =============================================================================
-- 5. Update join_dedicated_makeup_waitlist RPC — validate group_size_type match
-- =============================================================================
CREATE OR REPLACE FUNCTION public.join_dedicated_makeup_waitlist(
  p_cancellation_id UUID,
  p_makeup_session_id UUID,
  p_joined_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancel RECORD;
  v_course RECORD;
  v_makeup_session RECORD;
  v_caller_role TEXT;
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
  v_is_parent BOOLEAN;
  v_result_id UUID;
BEGIN
  -- Get caller role
  SELECT role INTO v_caller_role FROM users WHERE id = p_joined_by;
  v_is_admin := (v_caller_role = 'admin');

  -- Fetch cancellation
  SELECT sc.id, sc.student_id, sc.course_id, sc.class_id,
         sc.session_number, sc.session_date, sc.group_size_type, sc.status,
         sc.credit_deadline
  INTO v_cancel
  FROM session_cancellations sc
  WHERE sc.id = p_cancellation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation not found';
  END IF;

  IF v_cancel.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancellation not in cancelled status';
  END IF;

  IF v_cancel.group_size_type NOT IN ('small', 'medium') THEN
    RAISE EXCEPTION 'Dedicated makeup waitlist only for small/medium groups';
  END IF;

  -- Auth check
  SELECT EXISTS(
    SELECT 1 FROM students WHERE user_id = p_joined_by AND id = v_cancel.student_id
  ) INTO v_is_owner;

  SELECT EXISTS(
    SELECT 1 FROM students WHERE parent_id = p_joined_by AND id = v_cancel.student_id
  ) INTO v_is_parent;

  IF NOT (v_is_admin OR v_is_owner OR v_is_parent) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Fetch makeup session
  SELECT * INTO v_makeup_session
  FROM makeup_sessions
  WHERE id = p_makeup_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Makeup session not found';
  END IF;

  IF NOT v_makeup_session.active THEN
    RAISE EXCEPTION 'Makeup session is not active';
  END IF;

  -- Subject+level match
  SELECT * INTO v_course FROM courses WHERE id = v_cancel.course_id;

  IF v_course.subject != v_makeup_session.subject OR v_course.level != v_makeup_session.level THEN
    RAISE EXCEPTION 'Makeup session subject/level does not match';
  END IF;

  -- Group size type must match
  IF v_cancel.group_size_type != v_makeup_session.group_size_type THEN
    RAISE EXCEPTION 'Makeup session group size does not match';
  END IF;

  -- Must be in the future
  IF v_makeup_session.session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot join waitlist for a past session';
  END IF;

  -- Must be before credit deadline
  IF v_cancel.credit_deadline IS NOT NULL
     AND (v_makeup_session.session_date + v_makeup_session.session_time) > v_cancel.credit_deadline
  THEN
    RAISE EXCEPTION 'Makeup session is after the credit deadline';
  END IF;

  -- Insert (unique constraint prevents duplicates)
  INSERT INTO makeup_waitlist (
    student_id, cancellation_id, host_class_id, makeup_session_id,
    session_number, session_date
  ) VALUES (
    v_cancel.student_id, p_cancellation_id, NULL, p_makeup_session_id,
    v_cancel.session_number, v_makeup_session.session_date
  ) RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

-- =============================================================================
-- 6. Update auto_book_dedicated_makeup_from_waitlist RPC — validate group_size_type
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_book_dedicated_makeup_from_waitlist(
  p_makeup_session_id UUID
)
RETURNS TABLE(booking_id UUID, student_id UUID, waitlist_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_entry RECORD;
  v_cancel RECORD;
  v_course RECORD;
  v_booked_count INTEGER;
  v_new_booking_id UUID;
BEGIN
  -- Lock the makeup session
  SELECT * INTO v_session
  FROM makeup_sessions ms
  WHERE ms.id = p_makeup_session_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_session.active THEN
    RETURN;
  END IF;

  -- FIFO through waiting entries
  FOR v_entry IN
    SELECT mw.*
    FROM makeup_waitlist mw
    WHERE mw.makeup_session_id = p_makeup_session_id
      AND mw.status = 'waiting'
    ORDER BY mw.created_at ASC
    FOR UPDATE
  LOOP
    -- Check capacity
    SELECT COUNT(*) INTO v_booked_count
    FROM makeup_bookings mb
    WHERE mb.makeup_session_id = p_makeup_session_id
      AND mb.status = 'booked';

    IF v_booked_count >= v_session.capacity THEN
      EXIT; -- Session full
    END IF;

    -- Verify cancellation still in cancelled status
    SELECT * INTO v_cancel
    FROM session_cancellations sc
    WHERE sc.id = v_entry.cancellation_id
    FOR UPDATE;

    IF NOT FOUND OR v_cancel.status <> 'cancelled' THEN
      -- Mark waitlist entry as expired
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Verify subject+level still matches
    SELECT * INTO v_course FROM courses WHERE id = v_cancel.course_id;
    IF v_course.subject != v_session.subject OR v_course.level != v_session.level THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Verify group_size_type matches
    IF v_cancel.group_size_type != v_session.group_size_type THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Verify not past credit deadline
    IF v_cancel.credit_deadline IS NOT NULL
       AND (v_session.session_date + v_session.session_time) > v_cancel.credit_deadline
    THEN
      UPDATE makeup_waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Delete any previous cancelled booking for this cancellation
    DELETE FROM makeup_bookings
    WHERE cancellation_id = v_entry.cancellation_id
      AND status = 'cancelled';

    -- Insert booking
    INSERT INTO makeup_bookings (
      cancellation_id, student_id, host_class_id, host_course_id,
      makeup_session_id, session_number, session_date, status
    ) VALUES (
      v_entry.cancellation_id, v_entry.student_id, NULL, NULL,
      p_makeup_session_id, v_entry.session_number, v_session.session_date, 'booked'
    ) RETURNING id INTO v_new_booking_id;

    -- Update cancellation status
    UPDATE session_cancellations
    SET status = 'rescheduled'
    WHERE id = v_entry.cancellation_id;

    -- Mark waitlist entry as booked
    UPDATE makeup_waitlist
    SET status = 'booked'
    WHERE id = v_entry.id;

    -- Log
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
      'dedicated_makeup_auto_booked',
      jsonb_build_object(
        'booking_id', v_new_booking_id,
        'cancellation_id', v_entry.cancellation_id,
        'student_id', v_entry.student_id,
        'makeup_session_id', p_makeup_session_id,
        'waitlist_id', v_entry.id
      )
    );

    booking_id := v_new_booking_id;
    student_id := v_entry.student_id;
    waitlist_id := v_entry.id;
    RETURN NEXT;
  END LOOP;
END;
$$;
