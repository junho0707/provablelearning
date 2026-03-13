-- ============================================================
-- Migration 00049: Remove medium group_size_type
-- - Remove 'medium' from group_size_type enum
-- - Drop medium capacity constraint
-- - Update large capacity max from 30 to 20
-- - Update RPCs: 1:1 now eligible for dedicated makeups
-- - Update cancel_session: remove medium from credit eligible
-- ============================================================

-- =============================================================================
-- 1. Replace group_size_type enum (remove medium)
-- =============================================================================
-- Cannot remove a value from an existing enum, so we recreate it.
-- First rename old type, create new, alter all columns, then drop old.

-- Drop CHECK constraints that reference group_size_type before renaming the enum
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS chk_capacity_one_on_one;
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS chk_capacity_small;
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS chk_capacity_medium;
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS chk_capacity_large;

ALTER TYPE group_size_type RENAME TO group_size_type_old;
CREATE TYPE group_size_type AS ENUM ('one_on_one', 'small', 'large');

-- Alter every column that uses the enum
ALTER TABLE public.classes
  ALTER COLUMN group_size_type TYPE group_size_type
  USING group_size_type::text::group_size_type;

ALTER TABLE public.session_cancellations
  ALTER COLUMN group_size_type TYPE group_size_type
  USING group_size_type::text::group_size_type;

-- Drop defaults before type conversion (can't auto-cast default values)
ALTER TABLE public.credits ALTER COLUMN group_size_type DROP DEFAULT;

ALTER TABLE public.credits
  ALTER COLUMN group_size_type TYPE group_size_type
  USING group_size_type::text::group_size_type;

ALTER TABLE public.credits ALTER COLUMN group_size_type SET DEFAULT 'large'::group_size_type;

ALTER TABLE public.makeup_sessions
  ALTER COLUMN group_size_type TYPE group_size_type
  USING group_size_type::text::group_size_type;

ALTER TABLE public.enrollments
  ALTER COLUMN credits_group_size_type TYPE group_size_type
  USING credits_group_size_type::text::group_size_type;

-- Drop functions whose signatures reference the old enum type
DROP FUNCTION IF EXISTS public.apply_credits(UUID, group_size_type_old);
DROP FUNCTION IF EXISTS public.reverse_credits(UUID, group_size_type_old, TEXT);

DROP TYPE group_size_type_old;

-- Recreate apply_credits with the new enum type
CREATE OR REPLACE FUNCTION public.apply_credits(
  p_student_id UUID,
  p_group_size_type public.group_size_type
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit RECORD;
BEGIN
  SELECT id, remaining_amount
  INTO v_credit
  FROM public.credits
  WHERE student_id = p_student_id
    AND group_size_type = p_group_size_type
    AND remaining_amount > 0
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at ASC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE public.credits
    SET remaining_amount = remaining_amount - 1
    WHERE id = v_credit.id;

  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
    'credit_applied',
    jsonb_build_object(
      'student_id', p_student_id,
      'group_size_type', p_group_size_type,
      'amount_deducted', 1
    )
  );

  RETURN 1;
END;
$$;

-- Recreate reverse_credits with the new enum type
CREATE OR REPLACE FUNCTION public.reverse_credits(
  p_student_id UUID,
  p_group_size_type public.group_size_type,
  p_reason TEXT DEFAULT 'Credits reversed'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_id UUID;
BEGIN
  INSERT INTO public.credits (student_id, amount, remaining_amount, group_size_type, reason)
  VALUES (p_student_id, 1, 1, p_group_size_type, p_reason)
  RETURNING id INTO v_credit_id;

  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
    'credit_reversed',
    jsonb_build_object(
      'student_id', p_student_id,
      'group_size_type', p_group_size_type,
      'credit_id', v_credit_id,
      'reason', p_reason
    )
  );

  RETURN v_credit_id;
END;
$$;

-- =============================================================================
-- 2. Drop medium capacity constraint, update large max to 20
-- =============================================================================
-- Re-add capacity constraints (dropped above before enum rename, minus medium)
ALTER TABLE public.classes ADD CONSTRAINT chk_capacity_one_on_one CHECK (
  group_size_type != 'one_on_one' OR capacity = 1
);
ALTER TABLE public.classes ADD CONSTRAINT chk_capacity_small CHECK (
  group_size_type != 'small' OR (capacity >= 2 AND capacity <= 6)
);
ALTER TABLE public.classes ADD CONSTRAINT chk_capacity_large CHECK (
  group_size_type != 'large' OR (capacity >= 10 AND capacity <= 20)
);

-- =============================================================================
-- 3. Update cancel_session RPC — remove medium from credit-eligible
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cancel_session(
  p_enrollment_id UUID,
  p_session_number INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_cancelled_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_class RECORD;
  v_course RECORD;
  v_student RECORD;
  v_session_date DATE;
  v_credit_deadline TIMESTAMPTZ;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_cancellation_id UUID;
  v_days_to_sunday INTEGER;
BEGIN
  v_caller := COALESCE(p_cancelled_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock enrollment row
  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  IF v_enrollment.status != 'active' THEN
    RAISE EXCEPTION 'Enrollment is not active';
  END IF;

  -- Validate session number
  IF p_session_number < 1 OR p_session_number > 8 THEN
    RAISE EXCEPTION 'Invalid session number (must be 1-8)';
  END IF;

  -- Load class + course
  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;
  SELECT * INTO v_course FROM public.courses WHERE id = v_enrollment.course_id;

  -- Load student for ownership check
  SELECT * INTO v_student FROM public.students WHERE id = v_enrollment.student_id;

  -- Authorization
  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE id = v_caller AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin
     AND v_student.user_id != v_caller
     AND v_student.parent_id != v_caller
  THEN
    RAISE EXCEPTION 'Not authorized to cancel this session';
  END IF;

  -- Compute session date
  v_session_date := public.compute_session_date(
    v_course.start_date, v_class.meeting_day, p_session_number
  );

  -- Session must be in the future
  IF v_session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot cancel a past or current-day session';
  END IF;

  -- 24-hour notice for small groups
  IF v_class.group_size_type = 'small' THEN
    IF v_session_date <= (CURRENT_DATE + INTERVAL '1 day')::DATE THEN
      RAISE EXCEPTION 'Small group sessions require at least 24 hours notice to cancel';
    END IF;
  END IF;

  -- Check for duplicate cancellation
  IF EXISTS(
    SELECT 1 FROM public.session_cancellations
    WHERE student_id = v_enrollment.student_id
      AND course_id = v_enrollment.course_id
      AND session_number = p_session_number
  ) THEN
    RAISE EXCEPTION 'This session has already been cancelled';
  END IF;

  -- Set credit deadline based on group size:
  -- small, one_on_one → end of the week (Sunday 11:59:59 PM ET)
  -- large → NULL (no credit)
  IF v_class.group_size_type IN ('small', 'one_on_one') THEN
    -- DOW: Sunday=0, Monday=1, ..., Saturday=6
    -- Days until Sunday: (7 - DOW) % 7  (Sunday itself → 0)
    v_days_to_sunday := (7 - EXTRACT(DOW FROM v_session_date)::INTEGER) % 7;
    v_credit_deadline := (
      (v_session_date + v_days_to_sunday * INTERVAL '1 day')
      + INTERVAL '23 hours 59 minutes 59 seconds'
    ) AT TIME ZONE 'America/New_York';
  END IF;
  -- large: v_credit_deadline stays NULL (no credit)

  -- Insert cancellation
  INSERT INTO public.session_cancellations (
    enrollment_id, student_id, course_id, class_id,
    session_number, session_date, group_size_type,
    reason, cancelled_by, status, credit_deadline
  ) VALUES (
    p_enrollment_id, v_enrollment.student_id, v_enrollment.course_id, v_enrollment.class_id,
    p_session_number, v_session_date, v_class.group_size_type,
    p_reason, v_caller, 'cancelled', v_credit_deadline
  ) RETURNING id INTO v_cancellation_id;

  -- Log to admin_logs
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'session_cancelled',
    jsonb_build_object(
      'cancellation_id', v_cancellation_id,
      'enrollment_id', p_enrollment_id,
      'student_id', v_enrollment.student_id,
      'course_id', v_enrollment.course_id,
      'session_number', p_session_number,
      'session_date', v_session_date,
      'group_size_type', v_class.group_size_type
    )
  );

  RETURN v_cancellation_id;
END;
$$;

-- =============================================================================
-- 4. Update book_dedicated_makeup RPC — 1:1 now eligible
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

  -- 3. Only one_on_one/small (dedicated sessions)
  IF v_cancellation.group_size_type NOT IN ('one_on_one', 'small') THEN
    RAISE EXCEPTION 'Dedicated makeup sessions are only for 1:1/small groups';
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
-- 5. Update join_dedicated_makeup_waitlist RPC — 1:1 now eligible
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

  IF v_cancel.group_size_type NOT IN ('one_on_one', 'small') THEN
    RAISE EXCEPTION 'Dedicated makeup waitlist only for 1:1/small groups';
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
-- 6. Update auto_book_dedicated_makeup_from_waitlist RPC — no change needed
--    (it already validates group_size_type match between cancel and session)
-- =============================================================================

-- =============================================================================
-- 7. Update book_makeup RPC (regular alternate sessions) — keep 1:1 block
--    1:1 still cannot use alternate regular sessions (only dedicated makeups)
-- =============================================================================
-- No change needed — the existing book_makeup blocks one_on_one, which is correct.
-- 1:1 uses dedicated makeups, not alternate regular sessions.

-- =============================================================================
-- 8. Update auto_book_makeup_from_waitlist — keep 1:1 block for regular makeups
-- =============================================================================
-- No change needed — existing check blocks one_on_one for regular alternate makeups.
