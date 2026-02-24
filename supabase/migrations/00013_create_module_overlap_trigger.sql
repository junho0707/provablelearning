-- Module overlap is enforced by the EXCLUDE constraint in 00004.
-- This migration adds an additional trigger for a clearer error message.
CREATE OR REPLACE FUNCTION check_module_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM modules
    WHERE subject = NEW.subject
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Module dates overlap with an existing module for subject %', NEW.subject;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_module_overlap
  BEFORE INSERT OR UPDATE ON public.modules
  FOR EACH ROW
  EXECUTE FUNCTION check_module_overlap();
