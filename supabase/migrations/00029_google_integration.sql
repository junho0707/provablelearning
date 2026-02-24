-- Phase 2: Google integration tables

-- Store OAuth2 refresh tokens for the tutor's Google account
CREATE TABLE IF NOT EXISTS google_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expiry timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_tokens_user ON google_tokens (user_id);

ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

-- Only admin can manage tokens
DROP POLICY IF EXISTS google_tokens_admin ON google_tokens;
CREATE POLICY google_tokens_admin ON google_tokens
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Add Google Classroom ID to classes (renamed from cohorts)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS google_classroom_id text;

-- Bookings table for parent meeting requests
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_name text NOT NULL,
  parent_email text NOT NULL,
  parent_phone text NOT NULL,
  datetime timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'canceled', 'completed')),
  google_event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_datetime ON bookings (datetime) WHERE status = 'confirmed';

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Public can insert bookings (no login required)
DROP POLICY IF EXISTS bookings_insert_public ON bookings;
CREATE POLICY bookings_insert_public ON bookings
  FOR INSERT WITH CHECK (true);

-- Admin can see and manage all bookings
DROP POLICY IF EXISTS bookings_admin ON bookings;
CREATE POLICY bookings_admin ON bookings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
