CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Role immutability trigger (supports bypass via session variable for admin RPC)
CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow bypass when session variable is set (used by admin_set_role_parent RPC)
  IF current_setting('app.bypass_role_check', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Role changes are not permitted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_role_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_change();
