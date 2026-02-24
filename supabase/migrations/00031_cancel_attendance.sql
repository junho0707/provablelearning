-- ============================================================
-- Migration 00031: Cancel Attendance Feature
-- Allows parents/students to cancel individual class sessions.
-- 1:1 -> reschedule via Google Calendar
-- Small group -> auto-credit after 1 week if not made up
-- Medium/Large -> no credit
-- ============================================================

-- 1. Create cancellation_status enum
DO $$ BEGIN
  CREATE TYPE public.cancellation_status AS ENUM ('cancelled', 'rescheduled', 'credit_issued', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create session_cancellations table
-- Note: references module_id/cohort_id which were the column names at the time this
-- migration was written. On the remote DB this table already exists with course_id/class_id
-- so CREATE TABLE IF NOT EXISTS will be a no-op.
CREATE TABLE IF NOT EXISTS public.session_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE RESTRICT,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  session_number INTEGER NOT NULL CHECK (session_number BETWEEN 1 AND 8),
  session_date DATE NOT NULL,
  group_size_type public.group_size_type NOT NULL,
  reason TEXT,
  cancelled_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status public.cancellation_status NOT NULL DEFAULT 'cancelled',
  rescheduled_to TIMESTAMPTZ,
  rescheduled_calendar_event_id TEXT,
  credit_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- No double-cancel for same session
  CONSTRAINT uq_student_module_session UNIQUE (student_id, module_id, session_number)
);

-- Index for cron: find cancellations eligible for auto-credit
CREATE INDEX IF NOT EXISTS idx_cancel_credit_deadline
  ON public.session_cancellations (credit_deadline)
  WHERE status = 'cancelled';

-- Index for lookups by enrollment
CREATE INDEX IF NOT EXISTS idx_cancel_enrollment
  ON public.session_cancellations (enrollment_id);

-- 3. Helper function: compute session date from module start, meeting day, and session number
CREATE OR REPLACE FUNCTION public.compute_session_date(
  p_module_start_date DATE,
  p_meeting_day TEXT,
  p_session_number INTEGER
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_day_map JSONB := '{"Sunday":0,"Monday":1,"Tuesday":2,"Wednesday":3,"Thursday":4,"Friday":5,"Saturday":6}'::JSONB;
  v_target_dow INTEGER;
  v_first_date DATE;
  v_current_dow INTEGER;
  v_offset INTEGER;
BEGIN
  v_target_dow := (v_day_map ->> p_meeting_day)::INTEGER;
  IF v_target_dow IS NULL THEN
    RAISE EXCEPTION 'Invalid meeting day: %', p_meeting_day;
  END IF;

  -- Find first occurrence of meeting_day on or after module start
  v_current_dow := EXTRACT(DOW FROM p_module_start_date)::INTEGER;
  v_offset := (v_target_dow - v_current_dow + 7) % 7;
  v_first_date := p_module_start_date + v_offset;

  -- Add weeks for session number (1-indexed)
  RETURN v_first_date + ((p_session_number - 1) * 7);
END;
$$;

-- 4. RPC: cancel_session
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
  v_cohort RECORD;
  v_module RECORD;
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

  -- Load cohort + module
  SELECT * INTO v_cohort FROM public.cohorts WHERE id = v_enrollment.cohort_id;
  SELECT * INTO v_module FROM public.modules WHERE id = v_enrollment.module_id;

  -- Load student for ownership check
  SELECT * INTO v_student FROM public.students WHERE id = v_enrollment.student_id;

  -- Authorization: caller must be the student, their parent, or an admin
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
    v_module.start_date, v_cohort.meeting_day, p_session_number
  );

  -- Session must be in the future
  IF v_session_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot cancel a past or current-day session';
  END IF;

  -- 24-hour notice for small groups
  IF v_cohort.group_size_type = 'small' THEN
    IF v_session_date <= (CURRENT_DATE + INTERVAL '1 day')::DATE THEN
      RAISE EXCEPTION 'Small group sessions require at least 24 hours notice to cancel';
    END IF;
  END IF;

  -- Check for duplicate cancellation (constraint will catch too, but nice error)
  IF EXISTS(
    SELECT 1 FROM public.session_cancellations
    WHERE student_id = v_enrollment.student_id
      AND module_id = v_enrollment.module_id
      AND session_number = p_session_number
  ) THEN
    RAISE EXCEPTION 'This session has already been cancelled';
  END IF;

  -- Set credit deadline for small groups only
  IF v_cohort.group_size_type = 'small' THEN
    v_credit_deadline := v_session_date::TIMESTAMPTZ + INTERVAL '7 days';
  END IF;

  -- Insert cancellation
  INSERT INTO public.session_cancellations (
    enrollment_id, student_id, module_id, cohort_id,
    session_number, session_date, group_size_type,
    reason, cancelled_by, status, credit_deadline
  ) VALUES (
    p_enrollment_id, v_enrollment.student_id, v_enrollment.module_id, v_enrollment.cohort_id,
    p_session_number, v_session_date, v_cohort.group_size_type,
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
      'module_id', v_enrollment.module_id,
      'session_number', p_session_number,
      'session_date', v_session_date,
      'group_size_type', v_cohort.group_size_type
    )
  );

  RETURN v_cancellation_id;
END;
$$;

-- 5. RLS
ALTER TABLE public.session_cancellations ENABLE ROW LEVEL SECURITY;

-- SELECT: students see own, parents see children's, admins see all
DROP POLICY IF EXISTS "Students can view own cancellations" ON public.session_cancellations;
CREATE POLICY "Students can view own cancellations"
  ON public.session_cancellations FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Parents can view children cancellations" ON public.session_cancellations;
CREATE POLICY "Parents can view children cancellations"
  ON public.session_cancellations FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all cancellations" ON public.session_cancellations;
CREATE POLICY "Admins can view all cancellations"
  ON public.session_cancellations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- No direct INSERT/UPDATE/DELETE for non-admins; inserts go through SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Admins can manage cancellations" ON public.session_cancellations;
CREATE POLICY "Admins can manage cancellations"
  ON public.session_cancellations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
