-- RPC: Admin-only role change from student to parent
-- Uses session variable to bypass role immutability trigger (transaction-scoped, safe)
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
