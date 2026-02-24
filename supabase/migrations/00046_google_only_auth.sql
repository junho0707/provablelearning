-- Migration: Google-only OAuth
-- Adds email + full_name to students for pre-registration matching,
-- makes user_id nullable (pending students), drops username infrastructure.

-- 1. Add email column to students (for pre-registration matching)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'email'
  ) THEN
    ALTER TABLE students ADD COLUMN email TEXT;
  END IF;
END $$;

-- 2. Add full_name column to students (stored directly for pending students)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE students ADD COLUMN full_name TEXT;
  END IF;
END $$;

-- 3. Case-insensitive unique index on students.email (partial: WHERE email IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_email_ci
  ON students (LOWER(email))
  WHERE email IS NOT NULL;

-- 4. Make students.user_id nullable (pending students have no auth user yet)
ALTER TABLE students ALTER COLUMN user_id DROP NOT NULL;

-- 5. Replace the absolute UNIQUE constraint on user_id with a partial unique index
--    (allows multiple NULL user_id rows for pending students)
DO $$ BEGIN
  ALTER TABLE students DROP CONSTRAINT IF EXISTS students_user_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_user_id_not_null
  ON students (user_id)
  WHERE user_id IS NOT NULL;

-- 6. Drop username CHECK constraint and unique index from users table (migration 00039)
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_username_format;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DROP INDEX IF EXISTS uq_users_username_ci;
