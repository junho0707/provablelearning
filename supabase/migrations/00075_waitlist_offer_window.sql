-- Add offer_expires_at to waitlist for SG/1:1 notify-then-accept flow
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ;
