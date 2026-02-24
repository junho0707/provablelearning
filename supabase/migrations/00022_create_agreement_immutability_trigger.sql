-- Prevent modification of agreement fields on active enrollments
CREATE OR REPLACE FUNCTION prevent_agreement_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'active' THEN
    IF NEW.agreement_version IS DISTINCT FROM OLD.agreement_version THEN
      RAISE EXCEPTION 'Cannot modify agreement_version on active enrollment';
    END IF;
    IF NEW.agreement_timestamp IS DISTINCT FROM OLD.agreement_timestamp THEN
      RAISE EXCEPTION 'Cannot modify agreement_timestamp on active enrollment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_agreement_modification
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_agreement_modification();
