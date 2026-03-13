-- Add enrollment_code column to classes for Google Classroom join code
ALTER TABLE classes ADD COLUMN IF NOT EXISTS google_classroom_enrollment_code TEXT;
