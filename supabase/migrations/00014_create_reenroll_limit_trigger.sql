-- Re-enrollment limit trigger (belt-and-suspenders with RPC check)
CREATE OR REPLACE FUNCTION check_reenroll_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_subject subject_type;
  v_max_reenroll INTEGER;
  v_count INTEGER;
BEGIN
  -- Get the subject for this enrollment's module
  SELECT m.subject, m.max_reenroll
  INTO v_subject, v_max_reenroll
  FROM modules m
  WHERE m.id = NEW.module_id;

  -- Count existing enrollments for this student in this subject
  SELECT COUNT(*)
  INTO v_count
  FROM enrollments e
  JOIN modules m ON m.id = e.module_id
  WHERE e.student_id = NEW.student_id
    AND m.subject = v_subject
    AND e.status IN ('active', 'completed');

  IF v_count >= v_max_reenroll THEN
    RAISE EXCEPTION 'Student has reached re-enrollment limit (%) for subject %', v_max_reenroll, v_subject;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_reenroll_limit
  BEFORE INSERT ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION check_reenroll_limit();
