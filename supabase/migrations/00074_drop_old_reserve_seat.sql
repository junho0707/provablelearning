-- Drop the old reserve_seat overload (without p_student_start_date param)
-- that still has the 1:1 single-slot restriction.
DROP FUNCTION IF EXISTS public.reserve_seat(UUID, UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN);
