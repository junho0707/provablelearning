CREATE TABLE public.cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE RESTRICT,
  group_size_type group_size_type NOT NULL,
  capacity INTEGER NOT NULL,
  meeting_day TEXT NOT NULL,
  meeting_time TIME NOT NULL,
  google_meet_link TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Capacity must match group size type ranges
  CONSTRAINT chk_capacity_one_on_one CHECK (
    group_size_type != 'one_on_one' OR capacity = 1
  ),
  CONSTRAINT chk_capacity_small CHECK (
    group_size_type != 'small' OR (capacity >= 2 AND capacity <= 4)
  ),
  CONSTRAINT chk_capacity_medium CHECK (
    group_size_type != 'medium' OR (capacity >= 5 AND capacity <= 9)
  ),
  CONSTRAINT chk_capacity_large CHECK (
    group_size_type != 'large' OR (capacity >= 10 AND capacity <= 30)
  )
);
