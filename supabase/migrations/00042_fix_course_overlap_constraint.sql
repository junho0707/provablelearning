-- Fix: allow different levels of the same subject to have overlapping dates.
-- e.g. "SAT RW Essentials" and "SAT RW Advanced" can run concurrently.
-- Overlap is now per (subject, level), not just per subject.

-- 1. Drop the old EXCLUDE constraint (subject-only)
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS excl_course_subject_dates;
-- Also drop the original name in case rename migration didn't run
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS excl_module_subject_dates;

-- 2. New EXCLUDE constraint on (subject, level)
ALTER TABLE public.courses ADD CONSTRAINT excl_course_subject_level_dates EXCLUDE USING gist (
  subject WITH =,
  level WITH =,
  daterange(start_date, end_date, '[]') WITH &&
);

-- 3. Update the trigger function to also check level
CREATE OR REPLACE FUNCTION check_course_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM courses
    WHERE subject = NEW.subject
      AND level = NEW.level
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Course dates overlap with an existing course for this subject and level: % %', NEW.subject, NEW.level;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
