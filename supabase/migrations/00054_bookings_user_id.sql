-- Add user_id to bookings so logged-in users' consultations are linked to their account
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Index for fast lookup on the dashboard
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id) WHERE user_id IS NOT NULL;

-- Backfill: link existing bookings to users by matching email (case-insensitive)
UPDATE bookings b
SET user_id = u.id
FROM auth.users u
WHERE b.user_id IS NULL
  AND lower(b.parent_email) = lower(u.email);

-- Allow logged-in users to see their own bookings
DROP POLICY IF EXISTS bookings_select_own ON bookings;
CREATE POLICY bookings_select_own ON bookings
  FOR SELECT USING (user_id = auth.uid());
