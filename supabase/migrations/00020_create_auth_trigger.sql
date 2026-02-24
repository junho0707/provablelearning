-- Trigger: on auth.users INSERT → create public.users (+ students row if student)
-- OAuth users (no role in metadata) skip profile creation — handled during onboarding
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role;
  v_full_name TEXT;
  v_phone TEXT;
BEGIN
  -- OAuth users won't have role in metadata — skip, let onboarding handle it
  IF NEW.raw_user_meta_data->>'role' IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := (NEW.raw_user_meta_data->>'role')::user_role;
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  );
  v_phone := NEW.raw_user_meta_data->>'phone';

  -- Block admin self-signup
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts cannot be self-created';
  END IF;

  -- Create public.users row
  INSERT INTO public.users (id, role, full_name, phone)
  VALUES (NEW.id, v_role, v_full_name, v_phone)
  ON CONFLICT (id) DO NOTHING;

  -- If student, also create students row
  IF v_role = 'student' THEN
    INSERT INTO public.students (user_id, parent_id, active_status)
    VALUES (NEW.id, NULL, 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_auth_user();
