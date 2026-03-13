-- ============================================================
-- Migration 00050: Fix admin_logs zero-UUID FK violation
-- Several RPCs/triggers use COALESCE(auth.uid(), zero-UUID) for
-- admin_logs.admin_id, but the zero UUID doesn't exist in users,
-- causing FK violations when called from cron (no auth session).
-- Fix: look up a real admin user ID, fallback to NULL-safe insert.
-- ============================================================

-- 1. apply_credits — fix admin_logs insert
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
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

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
    COALESCE(auth.uid(), v_admin_id),
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

-- 2. reverse_credits — fix admin_logs insert
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
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  INSERT INTO public.credits (student_id, amount, remaining_amount, group_size_type, reason)
  VALUES (p_student_id, 1, 1, p_group_size_type, p_reason)
  RETURNING id INTO v_credit_id;

  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), v_admin_id),
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

-- 3. audit_performance_log_update trigger — fix admin_logs insert
CREATE OR REPLACE FUNCTION audit_performance_log_update()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), v_admin_id),
    'performance_log_updated',
    jsonb_build_object(
      'performance_log_id', OLD.id,
      'student_id', OLD.student_id,
      'course_id', OLD.course_id,
      'session_number', OLD.session_number,
      'old_attendance', OLD.attendance,
      'new_attendance', NEW.attendance,
      'old_homework', OLD.homework_completed,
      'new_homework', NEW.homework_completed,
      'old_notes', OLD.notes,
      'new_notes', NEW.notes
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. cleanup_stale_pending — fix admin_logs insert
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_cleaned INTEGER := 0;
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  FOR v_enrollment IN
    SELECT id, student_id, credits_applied, credits_group_size_type
    FROM enrollments
    WHERE status = 'pending'
      AND created_at < now() - interval '30 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_enrollment.credits_applied > 0 AND v_enrollment.credits_group_size_type IS NOT NULL THEN
      PERFORM reverse_credits(
        v_enrollment.student_id,
        v_enrollment.credits_group_size_type,
        'Stale pending enrollment cleaned up — credits reversed'
      );
    END IF;

    DELETE FROM enrollments WHERE id = v_enrollment.id AND status = 'pending';
    v_cleaned := v_cleaned + 1;
  END LOOP;

  IF v_cleaned > 0 THEN
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      v_admin_id,
      'stale_pending_cleanup',
      jsonb_build_object('cleaned_count', v_cleaned)
    );
  END IF;

  RETURN v_cleaned;
END;
$$;
