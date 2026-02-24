-- Add username column to users table for student login
ALTER TABLE public.users ADD COLUMN username TEXT;

-- Username format: alphanumeric + underscore, 3-30 chars
ALTER TABLE public.users ADD CONSTRAINT users_username_format
  CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$');

-- Case-insensitive unique index (only for non-null usernames)
CREATE UNIQUE INDEX users_username_unique
  ON public.users (LOWER(username))
  WHERE username IS NOT NULL;
