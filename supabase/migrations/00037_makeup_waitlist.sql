-- Migration 00037: makeup_waitlist table, RLS, join_makeup_waitlist RPC

-- =============================================================================
-- 1. makeup_waitlist table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.makeup_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  cancellation_id UUID NOT NULL REFERENCES public.session_cancellations(id) ON DELETE RESTRICT,
  host_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  session_number INTEGER NOT NULL CHECK (session_number BETWEEN 1 AND 8),
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'expired', 'booked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  CONSTRAINT uq_makeup_wl_student_cancel_class UNIQUE (student_id, cancellation_id, host_class_id)
);

-- Index: find waiting entries for a given host class + session
CREATE INDEX IF NOT EXISTS idx_makeup_wl_host_session_waiting
  ON public.makeup_waitlist (host_class_id, session_number)
  WHERE status = 'waiting';

-- Index: expire by session_date
CREATE INDEX IF NOT EXISTS idx_makeup_wl_session_date_active
  ON public.makeup_waitlist (session_date)
  WHERE status IN ('waiting', 'notified');

-- Index: student lookup
CREATE INDEX IF NOT EXISTS idx_makeup_wl_student_active
  ON public.makeup_waitlist (student_id)
  WHERE status IN ('waiting', 'notified');

-- =============================================================================
-- 2. RLS
-- =============================================================================
ALTER TABLE public.makeup_waitlist ENABLE ROW LEVEL SECURITY;

-- Students see own entries
DROP POLICY IF EXISTS makeup_wl_student_select ON public.makeup_waitlist;
CREATE POLICY makeup_wl_student_select ON public.makeup_waitlist
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Parents see children's entries
DROP POLICY IF EXISTS makeup_wl_parent_select ON public.makeup_waitlist;
CREATE POLICY makeup_wl_parent_select ON public.makeup_waitlist
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT id FROM students WHERE parent_id = auth.uid()
    )
  );

-- Admins manage all
DROP POLICY IF EXISTS makeup_wl_admin_all ON public.makeup_waitlist;
CREATE POLICY makeup_wl_admin_all ON public.makeup_waitlist
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- 3. join_makeup_waitlist RPC (SECURITY DEFINER)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.join_makeup_waitlist(
  p_cancellation_id UUID,
  p_host_class_id UUID,
  p_joined_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancel RECORD;
  v_host_class RECORD;
  v_course RECORD;
  v_session_date DATE;
  v_host_meeting_time TIME;
  v_cutoff TIMESTAMPTZ;
  v_is_owner BOOLEAN;
  v_is_parent BOOLEAN;
  v_is_admin BOOLEAN;
  v_caller_role TEXT;
  v_sessions RECORD;
  v_host_week_start DATE;
  v_orig_week_start DATE;
  v_result_id UUID;
BEGIN
  -- Get caller role
  SELECT role INTO v_caller_role FROM users WHERE id = p_joined_by;
  v_is_admin := (v_caller_role = 'admin');

  -- Fetch cancellation
  SELECT sc.id, sc.student_id, sc.course_id, sc.class_id,
         sc.session_number, sc.session_date, sc.group_size_type, sc.status
  INTO v_cancel
  FROM session_cancellations sc
  WHERE sc.id = p_cancellation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation not found';
  END IF;

  IF v_cancel.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancellation not in cancelled status';
  END IF;

  IF v_cancel.group_size_type = 'one_on_one' THEN
    RAISE EXCEPTION 'Waitlist not available for 1:1';
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

  -- Fetch host class
  SELECT c.id, c.course_id, c.group_size_type, c.meeting_day, c.meeting_time, c.active
  INTO v_host_class
  FROM classes c
  WHERE c.id = p_host_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Host class not found';
  END IF;

  IF NOT v_host_class.active THEN
    RAISE EXCEPTION 'Host class is not active';
  END IF;

  -- Same course
  IF v_host_class.course_id <> v_cancel.course_id THEN
    RAISE EXCEPTION 'Host class must be same course';
  END IF;

  -- Same group size
  IF v_host_class.group_size_type <> v_cancel.group_size_type THEN
    RAISE EXCEPTION 'Host class must be same group size';
  END IF;

  -- Different class
  IF v_host_class.id = v_cancel.class_id THEN
    RAISE EXCEPTION 'Cannot waitlist in same class';
  END IF;

  -- Compute session date for host class
  SELECT start_date INTO v_course FROM courses WHERE id = v_cancel.course_id;

  -- Compute host session date using session_number offset from course start
  -- Find the first meeting_day on or after course start, then add (session_number-1) weeks
  v_session_date := v_course.start_date;
  -- Advance to the first meeting day
  WHILE to_char(v_session_date, 'FMDay') <> v_host_class.meeting_day LOOP
    v_session_date := v_session_date + 1;
  END LOOP;
  v_session_date := v_session_date + (v_cancel.session_number - 1) * 7;

  -- Same week check (Sunday-based)
  v_orig_week_start := v_cancel.session_date - EXTRACT(DOW FROM v_cancel.session_date)::INTEGER;
  v_host_week_start := v_session_date - EXTRACT(DOW FROM v_session_date)::INTEGER;

  IF v_orig_week_start <> v_host_week_start THEN
    RAISE EXCEPTION 'Host session must be in same week';
  END IF;

  -- 6-hour cutoff
  v_host_meeting_time := v_host_class.meeting_time::TIME;
  v_cutoff := (v_session_date + v_host_meeting_time) - INTERVAL '6 hours';

  IF now() >= v_cutoff THEN
    RAISE EXCEPTION 'Too late to join waitlist (cutoff is 6 hours before session)';
  END IF;

  -- Insert (unique constraint prevents duplicates)
  INSERT INTO makeup_waitlist (student_id, cancellation_id, host_class_id, session_number, session_date)
  VALUES (v_cancel.student_id, p_cancellation_id, p_host_class_id, v_cancel.session_number, v_session_date)
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;
