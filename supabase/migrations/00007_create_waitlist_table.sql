CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  status waitlist_status NOT NULL DEFAULT 'waiting',

);

-- Partial unique index: allows re-joining waitlist after expiry
CREATE UNIQUE INDEX uq_waitlist_student_cohort_active
  ON public.waitlist (student_id, cohort_id)
  WHERE status IN ('waiting', 'notified');
