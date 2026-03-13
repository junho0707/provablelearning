-- Single-row table to store the active consultation booking window.
-- Only slots within [window_start, window_end] are shown to users.
-- When no row exists or both dates are NULL, no slots are available.

CREATE TABLE booking_window (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), -- ensures single row
  window_start date,
  window_end date,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_range CHECK (window_start IS NULL OR window_end IS NULL OR window_start <= window_end)
);

-- Seed with NULL window (bookings disabled by default until admin sets dates)
INSERT INTO booking_window (id) VALUES (true);

-- Anyone can read the window (public booking page needs it)
ALTER TABLE booking_window ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_window_select ON booking_window
  FOR SELECT USING (true);

CREATE POLICY booking_window_admin ON booking_window
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
