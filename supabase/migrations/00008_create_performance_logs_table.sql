CREATE TABLE public.performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 4),
  session_number INTEGER NOT NULL CHECK (session_number >= 1 AND session_number <= 8),
  attendance BOOLEAN NOT NULL DEFAULT false,
  homework_completed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_perf_student_module_session UNIQUE (student_id, module_id, session_number)
);
