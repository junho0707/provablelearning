-- Migration 00051: Credits for dedicated makeup sessions only (not regular enrollment)
-- 1. Add subject/level/source_cancellation_id to credits
-- 2. Update makeup_bookings: nullable cancellation_id, add credit_id, CHECK constraint
-- 3. Update reverse_credits RPC to accept subject/level/source_cancellation_id
-- 4. New book_makeup_with_credit RPC
-- 5. Update cancel_makeup_booking to handle credit-based bookings

-- =============================================================================
-- 1. Add subject/level/source to credits table
-- =============================================================================
ALTER TABLE credits ADD COLUMN IF NOT EXISTS subject public.subject_type;
ALTER TABLE credits ADD COLUMN IF NOT EXISTS level public.course_level;
ALTER TABLE credits ADD COLUMN IF NOT EXISTS source_cancellation_id UUID REFERENCES session_cancellations(id);

-- =============================================================================
-- 2. Makeup bookings — support credit-based bookings
-- =============================================================================

-- Allow cancellation_id to be NULL (credit-based bookings have no cancellation)
ALTER TABLE makeup_bookings ALTER COLUMN cancellation_id DROP NOT NULL;

-- Add credit_id column
ALTER TABLE makeup_bookings ADD COLUMN IF NOT EXISTS credit_id UUID REFERENCES credits(id);

-- Drop the old unique constraint (cancellation_id unique across all rows)
ALTER TABLE makeup_bookings DROP CONSTRAINT IF EXISTS uq_makeup_cancellation;

-- Replace with partial unique index (only for cancellation-based bookings)
CREATE UNIQUE INDEX IF NOT EXISTS uq_makeup_cancellation_partial
  ON makeup_bookings (cancellation_id) WHERE cancellation_id IS NOT NULL;

-- CHECK: exactly one of cancellation_id or credit_id must be set
DO $$ BEGIN
  ALTER TABLE makeup_bookings
    ADD CONSTRAINT chk_makeup_booking_source
    CHECK (
      (cancellation_id IS NOT NULL AND credit_id IS NULL)
      OR (cancellation_id IS NULL AND credit_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 3. Update reverse_credits RPC — accept optional subject/level/source_cancellation_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reverse_credits(
  p_student_id UUID,
  p_group_size_type public.group_size_type,
  p_reason TEXT DEFAULT 'Credits reversed',
  p_subject public.subject_type DEFAULT NULL,
  p_level public.course_level DEFAULT NULL,
  p_source_cancellation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_id UUID;
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  INSERT INTO public.credits (student_id, amount, remaining_amount, group_size_type, reason, subject, level, source_cancellation_id)
  VALUES (p_student_id, 1, 1, p_group_size_type, p_reason, p_subject, p_level, p_source_cancellation_id)
  RETURNING id INTO v_credit_id;

  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), v_admin_id),
    'credit_reversed',
    jsonb_build_object(
      'student_id', p_student_id,
      'group_size_type', p_group_size_type,
      'credit_id', v_credit_id,
      'reason', p_reason,
      'subject', p_subject,
      'level', p_level,
      'source_cancellation_id', p_source_cancellation_id
    )
  );

  RETURN v_credit_id;
END;
$$;

-- =============================================================================
-- 4. New RPC: book_makeup_with_credit
-- =============================================================================
CREATE OR REPLACE FUNCTION public.book_makeup_with_credit(
  p_student_id UUID,
  p_makeup_session_id UUID,
  p_booked_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_makeup_session RECORD;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_booked_count INTEGER;
  v_credit RECORD;
  v_booking_id UUID;
BEGIN
  v_caller := COALESCE(p_booked_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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

  -- 2. Lock + fetch makeup session
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

  IF v_makeup_session.session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book a past or current-day makeup session';
  END IF;

  -- 3. Capacity check
  SELECT COUNT(*) INTO v_booked_count
  FROM makeup_bookings mb
  WHERE mb.makeup_session_id = p_makeup_session_id
    AND mb.status = 'booked';

  IF v_booked_count >= v_makeup_session.capacity THEN
    RAISE EXCEPTION 'Makeup session is full';
  END IF;

  -- 4. Find oldest matching credit (FIFO)
  SELECT * INTO v_credit
  FROM credits cr
  WHERE cr.student_id = p_student_id
    AND cr.group_size_type = v_makeup_session.group_size_type
    AND cr.subject = v_makeup_session.subject
    AND cr.level = v_makeup_session.level
    AND cr.remaining_amount > 0
    AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
  ORDER BY cr.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No matching credit available for this makeup session';
  END IF;

  -- 5. Deduct credit
  UPDATE credits
  SET remaining_amount = remaining_amount - 1
  WHERE id = v_credit.id;

  -- 6. Insert booking (credit-based: cancellation_id is NULL)
  INSERT INTO makeup_bookings (
    cancellation_id, credit_id, student_id, host_class_id, host_course_id,
    makeup_session_id, session_number, session_date, status
  ) VALUES (
    NULL, v_credit.id, p_student_id, NULL, NULL,
    p_makeup_session_id, 1, v_makeup_session.session_date, 'booked'
  ) RETURNING id INTO v_booking_id;

  -- 7. Log
  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'credit_makeup_booked',
    jsonb_build_object(
      'booking_id', v_booking_id,
      'student_id', p_student_id,
      'makeup_session_id', p_makeup_session_id,
      'credit_id', v_credit.id,
      'session_date', v_makeup_session.session_date
    )
  );

  RETURN v_booking_id;
END;
$$;

-- =============================================================================
-- 5. Update cancel_makeup_booking — handle credit-based bookings
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cancel_makeup_booking(
  p_booking_id UUID,
  p_cancelled_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_student RECORD;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_admin_id UUID;
BEGIN
  v_caller := COALESCE(p_cancelled_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock booking row
  SELECT * INTO v_booking
  FROM public.makeup_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Makeup booking not found';
  END IF;

  IF v_booking.status != 'booked' THEN
    RAISE EXCEPTION 'Makeup booking is not in booked status';
  END IF;

  -- Auth check
  SELECT * INTO v_student FROM public.students WHERE id = v_booking.student_id;

  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE id = v_caller AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin
     AND v_student.user_id != v_caller
     AND v_student.parent_id != v_caller
  THEN
    RAISE EXCEPTION 'Not authorized to cancel this makeup booking';
  END IF;

  -- Update booking status
  UPDATE public.makeup_bookings
  SET status = 'cancelled'
  WHERE id = p_booking_id;

  -- Handle cancellation-based vs credit-based bookings
  IF v_booking.cancellation_id IS NOT NULL THEN
    -- Cancellation-based: revert cancellation status back to cancelled
    UPDATE public.session_cancellations
    SET status = 'cancelled'
    WHERE id = v_booking.cancellation_id;
  ELSIF v_booking.credit_id IS NOT NULL THEN
    -- Credit-based: restore the credit
    UPDATE public.credits
    SET remaining_amount = remaining_amount + 1
    WHERE id = v_booking.credit_id;
  END IF;

  -- Log
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(v_caller, v_admin_id),
    'makeup_cancelled',
    jsonb_build_object(
      'booking_id', p_booking_id,
      'cancellation_id', v_booking.cancellation_id,
      'credit_id', v_booking.credit_id,
      'student_id', v_booking.student_id,
      'host_class_id', v_booking.host_class_id,
      'session_number', v_booking.session_number
    )
  );
END;
$$;
