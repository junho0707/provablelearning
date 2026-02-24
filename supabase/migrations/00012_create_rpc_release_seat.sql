-- Release a pending seat (e.g., on Stripe session expiry)
-- Authorization: only enrollment owner, their parent, or admin
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
