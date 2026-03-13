-- Migration 00079: Fix makeup_bookings unique constraint
-- Old: (student_id, host_class_id, session_number) — breaks for credit-based bookings
-- New: (student_id, host_class_id, session_date) — one booking per student per class per date

ALTER TABLE makeup_bookings DROP CONSTRAINT IF EXISTS uq_makeup_student_class_session;

CREATE UNIQUE INDEX IF NOT EXISTS uq_makeup_student_class_date
  ON makeup_bookings (student_id, host_class_id, session_date)
  WHERE status = 'booked';
