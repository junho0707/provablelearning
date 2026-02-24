-- ============================================================
-- Admin Guardrail Triggers
-- ============================================================

-- 1. Prevent module deletion if active enrollments exist
CREATE OR REPLACE FUNCTION before_module_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM enrollments
  WHERE module_id = OLD.id
    AND status IN ('pending', 'active');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete module with % active/pending enrollment(s)', v_count;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_before_module_delete
  BEFORE DELETE ON public.modules
  FOR EACH ROW
  EXECUTE FUNCTION before_module_delete();

-- 2. Prevent cohort capacity reduction below active enrollment count
CREATE OR REPLACE FUNCTION before_cohort_capacity_update()
RETURNS TRIGGER AS $$
DECLARE
  v_active INTEGER;
BEGIN
  IF NEW.capacity < OLD.capacity THEN
    SELECT COUNT(*) INTO v_active
    FROM enrollments
    WHERE cohort_id = OLD.id
      AND status = 'active';

    IF NEW.capacity < v_active THEN
      RAISE EXCEPTION 'Cannot reduce capacity to % when % students are actively enrolled', NEW.capacity, v_active;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_before_cohort_capacity_update
  BEFORE UPDATE ON public.cohorts
  FOR EACH ROW
  WHEN (NEW.capacity IS DISTINCT FROM OLD.capacity)
  EXECUTE FUNCTION before_cohort_capacity_update();

-- 3. Audit trigger for performance_log updates
CREATE OR REPLACE FUNCTION audit_performance_log_update()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'performance_log_updated',
    jsonb_build_object(
      'performance_log_id', OLD.id,
      'student_id', OLD.student_id,
      'module_id', OLD.module_id,
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

CREATE TRIGGER trg_audit_performance_update
  AFTER UPDATE ON public.performance_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_performance_log_update();
