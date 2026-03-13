-- Track whether student has joined the Google Classroom
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS classroom_joined BOOLEAN DEFAULT FALSE;
