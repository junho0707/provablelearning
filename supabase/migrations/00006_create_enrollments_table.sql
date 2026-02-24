CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE RESTRICT,
  stripe_session_id TEXT,
  status enrollment_status NOT NULL DEFAULT 'pending',
  agreement_version TEXT,
  agreement_timestamp TIMESTAMPTZ,
  credits_applied INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- No duplicate enrollments
  CONSTRAINT uq_student_cohort UNIQUE (student_id, cohort_id),
  CONSTRAINT uq_stripe_session UNIQUE (stripe_session_id)
);

-- Partial unique index: prevents duplicate active/pending enrollments per student+module
-- but allows re-enrollment after refund/cancel (supports max_reenroll business rule)
CREATE UNIQUE INDEX uq_student_module_active
  ON public.enrollments (student_id, module_id)
  WHERE status IN ('pending', 'active');
