-- Store the Google Classroom alternate link (the working URL for students)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS google_classroom_link TEXT;
