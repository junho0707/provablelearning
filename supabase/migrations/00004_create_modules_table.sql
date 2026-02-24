-- Enable btree_gist for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject subject_type NOT NULL,
  level module_level NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_reenroll INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_module_dates CHECK (start_date < end_date),
  -- No overlapping modules per subject
  CONSTRAINT excl_module_subject_dates EXCLUDE USING gist (
    subject WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
);
