-- ★ CRITICAL: Atomic seat reservation with FOR UPDATE row lock
CREATE OR REPLACE FUNCTION reserve_seat(
  p_student_id UUID,
  p_cohort_id UUID,
  p_module_id UUID,
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
  v_module_start DATE;
  v_max_reenroll INTEGER;
  v_reenroll_count INTEGER;
  v_cohort_module_id UUID;
  v_cohort_active BOOLEAN;
BEGIN
  -- 0. Validate agreement fields
  IF p_agreement_version IS NULL OR p_agreement_timestamp IS NULL THEN
    RAISE EXCEPTION 'Agreement must be signed before enrollment';
  END IF;

  -- 1. Lock the cohort row to prevent concurrent modifications
  SELECT c.capacity, c.module_id, c.active, m.start_date, m.max_reenroll
  INTO v_capacity, v_cohort_module_id, v_cohort_active, v_module_start, v_max_reenroll
  FROM cohorts c
  JOIN modules m ON m.id = c.module_id
  WHERE c.id = p_cohort_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cohort not found';
  END IF;

  -- 1a. Validate cohort belongs to the specified module
  IF v_cohort_module_id != p_module_id THEN
    RAISE EXCEPTION 'Cohort does not belong to the specified module';
  END IF;

  -- 1b. Check cohort is active
  IF NOT v_cohort_active THEN
    RAISE EXCEPTION 'Cohort is not active';
  END IF;

  -- 2. Check module hasn't started
  IF v_module_start <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot enroll: module has already started';
  END IF;

  -- 3. Count active + pending enrollments
  SELECT COUNT(*)
  INTO v_current_count
  FROM enrollments
  WHERE cohort_id = p_cohort_id
    AND status IN ('pending', 'active');

  -- 4. Check capacity
  IF v_current_count >= v_capacity THEN
    RAISE EXCEPTION 'Cohort is full (% / %)', v_current_count, v_capacity;
  END IF;

  -- 5. Check re-enrollment limit per subject
  SELECT COUNT(*)
  INTO v_reenroll_count
  FROM enrollments e
  WHERE e.student_id = p_student_id
    AND e.module_id IN (
      SELECT id FROM modules WHERE subject = (
        SELECT subject FROM modules WHERE id = p_module_id
      )
    )
    AND e.status IN ('active', 'completed');

  IF v_reenroll_count >= v_max_reenroll THEN
    RAISE EXCEPTION 'Re-enrollment limit reached (% of % for this subject)', v_reenroll_count, v_max_reenroll;
  END IF;

  -- 6. Insert enrollment with status = 'pending'
  INSERT INTO enrollments (
    student_id, cohort_id, module_id,
    status, agreement_version, agreement_timestamp
  )
  VALUES (
    p_student_id, p_cohort_id, p_module_id,
    'pending', p_agreement_version, p_agreement_timestamp
  )
  RETURNING id INTO v_enrollment_id;

  RETURN v_enrollment_id;
END;
$$;
