-- ============================================================
-- Migration 00033: Makeup Session Booking System
-- Allows students with cancelled group sessions to join an
-- alternate class (same course, same group size) for the same
-- session that week.
-- Also updates credit deadline policy:
--   small/medium -> 7 days, one_on_one -> 14 days, large -> no credit
-- ============================================================

-- 1. Create makeup_bookings table
CREATE TABLE IF NOT EXISTS public.makeup_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_id UUID NOT NULL REFERENCES public.session_cancellations(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  host_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  host_course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  session_number INTEGER NOT NULL CHECK (session_number BETWEEN 1 AND 8),
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'attended', 'no_show', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One makeup booking per cancellation
  CONSTRAINT uq_makeup_cancellation UNIQUE (cancellation_id),
  -- One booking per student per host class session
  CONSTRAINT uq_makeup_student_class_session UNIQUE (student_id, host_class_id, session_number)
);

-- Index for capacity counting: booked makeups per host class session
CREATE INDEX IF NOT EXISTS idx_makeup_host_session_booked
  ON public.makeup_bookings (host_class_id, session_number)
  WHERE status = 'booked';

-- Index for cron: find no-show candidates
CREATE INDEX IF NOT EXISTS idx_makeup_session_date_booked
  ON public.makeup_bookings (session_date)
  WHERE status = 'booked';

-- Index for student lookups
CREATE INDEX IF NOT EXISTS idx_makeup_student
  ON public.makeup_bookings (student_id);

-- 2. Update cancel_session RPC to set credit_deadline for medium + one_on_one
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

  -- Set credit deadline based on group size
  IF v_class.group_size_type IN ('small', 'medium') THEN
    v_credit_deadline := v_session_date::TIMESTAMPTZ + INTERVAL '7 days';
  ELSIF v_class.group_size_type = 'one_on_one' THEN
    v_credit_deadline := v_session_date::TIMESTAMPTZ + INTERVAL '14 days';
  END IF;
  -- large: NULL (no credit)

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

-- 3. RPC: book_makeup_session
CREATE OR REPLACE FUNCTION public.book_makeup_session(
  p_cancellation_id UUID,
  p_host_class_id UUID,
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
  v_host_class RECORD;
  v_host_course RECORD;
  v_orig_class RECORD;
  v_caller UUID;
  v_is_admin BOOLEAN;
  v_host_session_date DATE;
  v_orig_week_start DATE;
  v_host_week_start DATE;
  v_active_count INTEGER;
  v_makeup_count INTEGER;
  v_booking_id UUID;
BEGIN
  v_caller := COALESCE(p_booked_by, auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Lock cancellation row
  SELECT * INTO v_cancellation
  FROM public.session_cancellations
  WHERE id = p_cancellation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation not found';
  END IF;

  -- 2. Validate status
  IF v_cancellation.status != 'cancelled' THEN
    RAISE EXCEPTION 'Cancellation is not in cancelled status';
  END IF;

  -- 3. Not available for 1:1 (they use Google Calendar reschedule)
  IF v_cancellation.group_size_type = 'one_on_one' THEN
    RAISE EXCEPTION 'Makeup booking not available for 1:1 sessions';
  END IF;

  -- 4. Auth check
  SELECT * INTO v_student FROM public.students WHERE id = v_cancellation.student_id;

  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE id = v_caller AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin
     AND v_student.user_id != v_caller
     AND v_student.parent_id != v_caller
  THEN
    RAISE EXCEPTION 'Not authorized to book this makeup';
  END IF;

  -- 5. Load host class + validate
  SELECT * INTO v_host_class
  FROM public.classes
  WHERE id = p_host_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Host class not found';
  END IF;

  SELECT * INTO v_host_course
  FROM public.courses
  WHERE id = v_host_class.course_id;

  -- Must be same course
  IF v_host_class.course_id != v_cancellation.course_id THEN
    RAISE EXCEPTION 'Host class must be for the same course';
  END IF;

  -- Must be same group size type
  IF v_host_class.group_size_type != v_cancellation.group_size_type THEN
    RAISE EXCEPTION 'Host class must have the same group size type';
  END IF;

  -- Must be a different class than the original
  IF v_host_class.id = v_cancellation.class_id THEN
    RAISE EXCEPTION 'Cannot book makeup in the same class';
  END IF;

  -- Must be active
  IF NOT v_host_class.active THEN
    RAISE EXCEPTION 'Host class is not active';
  END IF;

  -- 6. Compute host session date
  v_host_session_date := public.compute_session_date(
    v_host_course.start_date, v_host_class.meeting_day, v_cancellation.session_number
  );

  -- 7. Validate same week (Sunday-based: date - DOW gives Sunday)
  v_orig_week_start := v_cancellation.session_date - EXTRACT(DOW FROM v_cancellation.session_date)::INTEGER;
  v_host_week_start := v_host_session_date - EXTRACT(DOW FROM v_host_session_date)::INTEGER;

  IF v_orig_week_start != v_host_week_start THEN
    RAISE EXCEPTION 'Host session must be in the same week as the cancelled session';
  END IF;

  -- 8. Session must be in the future
  IF v_host_session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book a makeup for a past or current-day session';
  END IF;

  -- 9. Capacity check: active enrollments + booked makeups < capacity
  SELECT COUNT(*) INTO v_active_count
  FROM public.enrollments
  WHERE class_id = p_host_class_id
    AND status = 'active';

  SELECT COUNT(*) INTO v_makeup_count
  FROM public.makeup_bookings
  WHERE host_class_id = p_host_class_id
    AND session_number = v_cancellation.session_number
    AND status = 'booked';

  IF (v_active_count + v_makeup_count) >= v_host_class.capacity THEN
    RAISE EXCEPTION 'Host class session is full';
  END IF;

  -- 10. Insert booking
  INSERT INTO public.makeup_bookings (
    cancellation_id, student_id, host_class_id, host_course_id,
    session_number, session_date, status
  ) VALUES (
    p_cancellation_id, v_cancellation.student_id, p_host_class_id, v_host_class.course_id,
    v_cancellation.session_number, v_host_session_date, 'booked'
  ) RETURNING id INTO v_booking_id;

  -- 11. Update cancellation status to rescheduled
  UPDATE public.session_cancellations
  SET status = 'rescheduled'
  WHERE id = p_cancellation_id;

  -- 12. Log to admin_logs
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'makeup_booked',
    jsonb_build_object(
      'booking_id', v_booking_id,
      'cancellation_id', p_cancellation_id,
      'student_id', v_cancellation.student_id,
      'host_class_id', p_host_class_id,
      'session_number', v_cancellation.session_number,
      'session_date', v_host_session_date
    )
  );

  RETURN v_booking_id;
END;
$$;

-- 4. RPC: cancel_makeup_booking
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

  -- Revert cancellation status back to cancelled (credit deadline still ticking)
  UPDATE public.session_cancellations
  SET status = 'cancelled'
  WHERE id = v_booking.cancellation_id;

  -- Log
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_caller,
    'makeup_cancelled',
    jsonb_build_object(
      'booking_id', p_booking_id,
      'cancellation_id', v_booking.cancellation_id,
      'student_id', v_booking.student_id,
      'host_class_id', v_booking.host_class_id,
      'session_number', v_booking.session_number
    )
  );
END;
$$;

-- 5. RLS on makeup_bookings
ALTER TABLE public.makeup_bookings ENABLE ROW LEVEL SECURITY;

-- SELECT: students see own
DROP POLICY IF EXISTS "Students can view own makeup bookings" ON public.makeup_bookings;
CREATE POLICY "Students can view own makeup bookings"
  ON public.makeup_bookings FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- SELECT: parents see children's
DROP POLICY IF EXISTS "Parents can view children makeup bookings" ON public.makeup_bookings;
CREATE POLICY "Parents can view children makeup bookings"
  ON public.makeup_bookings FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE parent_id = auth.uid()
    )
  );

-- Admins can do everything
DROP POLICY IF EXISTS "Admins can manage makeup bookings" ON public.makeup_bookings;
CREATE POLICY "Admins can manage makeup bookings"
  ON public.makeup_bookings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- No direct INSERT/UPDATE/DELETE for non-admins; managed via SECURITY DEFINER RPCs
