CREATE TABLE public.credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  remaining_amount INTEGER NOT NULL CHECK (remaining_amount >= 0),
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_remaining_lte_amount CHECK (remaining_amount <= amount)
);
