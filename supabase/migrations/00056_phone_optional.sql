-- Make phone optional everywhere (only needed for SMS reminders / phone call bookings)

-- bookings.parent_phone: optional
ALTER TABLE bookings ALTER COLUMN parent_phone DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN parent_phone SET DEFAULT '';

-- Drop phone enforcement triggers (phone is now optional for all roles)
DROP TRIGGER IF EXISTS trg_enforce_phone ON public.users;
DROP FUNCTION IF EXISTS enforce_phone_requirement();

DROP TRIGGER IF EXISTS trg_enforce_student_phone ON public.students;
DROP FUNCTION IF EXISTS enforce_student_phone();
