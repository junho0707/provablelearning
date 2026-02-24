CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  grade_level INTEGER,
  active_status student_active_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION validate_parent_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.parent_id AND role = 'parent') THEN
      RAISE EXCEPTION 'parent_id must reference a user with role = parent';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_parent_role
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION validate_parent_role();
