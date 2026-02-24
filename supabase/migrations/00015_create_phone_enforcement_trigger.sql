-- Phone enforcement: parents must have phone, independent students must have phone
CREATE OR REPLACE FUNCTION enforce_phone_requirement()
RETURNS TRIGGER AS $$
BEGIN
  -- Parents always need a phone (enforced on UPDATE; INSERT may come from onboarding)
  IF NEW.role = 'parent' AND (NEW.phone IS NULL OR NEW.phone = '') THEN
    -- Allow INSERT without phone if coming from auth trigger (phone set during onboarding)
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Phone number is required for parent accounts';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_phone
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_phone_requirement();

-- Independent student phone enforcement (checked on UPDATE only — INSERT skipped for onboarding)
CREATE OR REPLACE FUNCTION enforce_student_phone()
RETURNS TRIGGER AS $$
DECLARE
  v_phone TEXT;
BEGIN
  -- Skip on INSERT: phone collected during onboarding, not available at auth trigger time
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: if student has no parent, their user must have a phone
  IF NEW.parent_id IS NULL THEN
    SELECT phone INTO v_phone
    FROM public.users
    WHERE id = NEW.user_id;

    IF v_phone IS NULL OR v_phone = '' THEN
      RAISE EXCEPTION 'Phone number is required for independent students';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_student_phone
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION enforce_student_phone();
