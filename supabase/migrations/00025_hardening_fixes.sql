-- ============================================================
-- Migration 00025: Hardening fixes from comprehensive audit
-- Fixes: reserve_seat, apply_credits, admin_set_role_parent,
--         pg_cron timing, constraints, RLS, release_seat,
--         credit reversal tracking
-- ============================================================

-- ============================================================
-- #3: Add credits_applied column to enrollments
-- Tracks how many credits (in cents) were applied for this enrollment
-- so they can be reversed if the Stripe session expires
-- ============================================================
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS credits_applied INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- RPC: Reverse credits applied to an enrollment
-- Called when a Stripe session expires after partial credits were applied
-- ============================================================
CREATE OR REPLACE FUNCTION public.reverse_credits(
  p_student_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'Stripe session expired — credits reversed'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  -- Issue a new credit row to restore the reversed amount
  INSERT INTO public.credits (student_id, amount, remaining_amount, reason)
  VALUES (p_student_id, p_amount, p_amount, p_reason)
  RETURNING id INTO v_credit_id;

  -- Log the reversal
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
    'credit_reversed',
    jsonb_build_object(
      'student_id', p_student_id,
      'amount_reversed', p_amount,
      'credit_id', v_credit_id,
      'reason', p_reason
    )
  );

  RETURN v_credit_id;
END;
$$;

-- ============================================================
-- #1: Replace uq_student_module with partial unique index
-- Allows re-enrollment after refund/cancel, prevents duplicates
-- for pending/active enrollments only
-- ============================================================
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS uq_student_module;
-- Use course_id (renamed from module_id in migration 00032)
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_course_active
  ON public.enrollments (student_id, course_id)
  WHERE status IN ('pending', 'active');

-- ============================================================
-- #7 + #8 + #16: Fix reserve_seat RPC
-- - Validate agreement fields NOT NULL
-- - Validate cohort belongs to module
-- - Check cohort is active
-- - Clean up dead joins in re-enrollment query
-- ============================================================
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
  SELECT c.capacity, c.course_id, c.active, cr.start_date, cr.max_reenroll
  INTO v_capacity, v_class_course_id, v_class_active, v_course_start, v_max_reenroll
  FROM classes c
  JOIN courses cr ON cr.id = c.course_id
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

  -- 5. Check re-enrollment limit per subject
  SELECT COUNT(*)
  INTO v_reenroll_count
  FROM enrollments e
  WHERE e.student_id = p_student_id
    AND e.course_id IN (
      SELECT id FROM courses WHERE subject = (
        SELECT subject FROM courses WHERE id = p_course_id
      )
    )
    AND e.status IN ('active', 'completed');

  IF v_reenroll_count >= v_max_reenroll THEN
    RAISE EXCEPTION 'Re-enrollment limit reached (% of % for this subject)', v_reenroll_count, v_max_reenroll;
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

-- ============================================================
-- #9 + #33 + #20: Fix apply_credits RPC
-- - Use INTEGER instead of NUMERIC (match credits table)
-- - Add SET search_path = public
-- - Log credit consumption to admin_logs
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_credits(
  p_student_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER := p_amount;
  v_deducted INTEGER := 0;
  v_credit RECORD;
BEGIN
  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  FOR v_credit IN
    SELECT id, remaining_amount
    FROM public.credits
    WHERE student_id = p_student_id
      AND remaining_amount > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at ASC NULLS LAST
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    IF v_credit.remaining_amount >= v_remaining THEN
      UPDATE public.credits
        SET remaining_amount = remaining_amount - v_remaining
        WHERE id = v_credit.id;
      v_deducted := v_deducted + v_remaining;
      v_remaining := 0;
    ELSE
      UPDATE public.credits
        SET remaining_amount = 0
        WHERE id = v_credit.id;
      v_deducted := v_deducted + v_credit.remaining_amount;
      v_remaining := v_remaining - v_credit.remaining_amount;
    END IF;
  END LOOP;

  -- Log credit consumption to admin_logs
  IF v_deducted > 0 THEN
    INSERT INTO public.admin_logs (admin_id, action, metadata_json)
    VALUES (
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
      'credit_applied',
      jsonb_build_object(
        'student_id', p_student_id,
        'amount_requested', p_amount,
        'amount_deducted', v_deducted
      )
    );
  END IF;

  RETURN v_deducted;
END;
$$;

-- ============================================================
-- #6: Fix admin_set_role_parent RPC
-- Use session variable instead of DISABLE/ENABLE TRIGGER
-- Check for existing enrollments before deleting students row
-- ============================================================

-- First, update the trigger to check session variable
CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow bypass when session variable is set (used by admin_set_role_parent RPC)
  IF current_setting('app.bypass_role_check', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Role changes are not permitted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace the admin RPC
CREATE OR REPLACE FUNCTION admin_set_role_parent(target_user_id UUID)
RETURNS void AS $$
DECLARE
  v_has_enrollments BOOLEAN;
BEGIN
  -- Verify caller is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;

  -- Check the user exists and is currently a student
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id AND role = 'student') THEN
    RAISE EXCEPTION 'User not found or is not a student';
  END IF;

  -- Check for active/pending enrollments that would block student deletion
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    WHERE s.user_id = target_user_id
      AND e.status IN ('pending', 'active')
  ) INTO v_has_enrollments;

  IF v_has_enrollments THEN
    RAISE EXCEPTION 'Cannot change role: user has active or pending enrollments';
  END IF;

  -- Use session variable to bypass role immutability trigger (transaction-scoped)
  SET LOCAL app.bypass_role_check = 'true';

  UPDATE public.users SET role = 'parent' WHERE id = target_user_id;

  -- Remove students row (safe: no active enrollments, CASCADE handles perf_logs/credits/waitlist)
  DELETE FROM public.students WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- #11: Fix pg_cron pending cleanup timing (5 min → 30 min)
-- Must match Stripe session expiry (PENDING_ENROLLMENT_TTL_MINUTES)
-- ============================================================
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old job
    PERFORM cron.unschedule('cleanup-stale-pending');
    -- Create new job with 30-minute window
    PERFORM cron.schedule(
      'cleanup-stale-pending',
      '* * * * *',
      $$DELETE FROM public.enrollments WHERE status = 'pending' AND created_at < now() - interval '30 minutes'$$
    );
  END IF;
END
$outer$;

-- ============================================================
-- #14: Replace waitlist UNIQUE constraint with partial unique index
-- Allows re-joining after expiry
-- ============================================================
ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS uq_waitlist_student_cohort;
-- Use class_id (renamed from cohort_id in migration 00032)
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_student_class_active
  ON public.waitlist (student_id, class_id)
  WHERE status IN ('waiting', 'notified');

-- ============================================================
-- #15: Fix release_seat RPC — add authorization check
-- Only the enrollment owner or admin can release a seat
-- ============================================================
CREATE OR REPLACE FUNCTION release_seat(
  p_enrollment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_user_id UUID;
  v_student_parent_id UUID;
BEGIN
  -- Look up enrollment and verify ownership
  SELECT s.user_id, s.parent_id
  INTO v_student_user_id, v_student_parent_id
  FROM enrollments e
  JOIN students s ON s.id = e.student_id
  WHERE e.id = p_enrollment_id
    AND e.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found or not in pending status';
  END IF;

  -- Only the student, their parent, or an admin can release
  IF auth.uid() != v_student_user_id
    AND auth.uid() != v_student_parent_id
    AND NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized to release this enrollment';
  END IF;

  DELETE FROM enrollments
  WHERE id = p_enrollment_id
    AND status = 'pending';
END;
$$;

-- ============================================================
-- #24: Parents can SELECT their children's users rows
-- ============================================================
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (
    id = auth.uid()
    OR id IN (SELECT user_id FROM public.students WHERE parent_id = auth.uid())
    OR is_admin()
  );
