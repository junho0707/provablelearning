-- Fix audit_performance_log_update trigger: OLD.course_id → OLD.class_id
-- The performance_logs table no longer has course_id (dropped in 00062)
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
      'class_id', OLD.class_id,
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
