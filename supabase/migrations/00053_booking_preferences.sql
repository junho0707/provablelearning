-- Migration 00053: Add booking preferences (contact method, meeting type, reminders)

-- Index from 00052 (uses 'absent' enum value, must be in separate transaction)
CREATE INDEX IF NOT EXISTS idx_cancel_absent_deadline
  ON public.session_cancellations (credit_deadline)
  WHERE status = 'absent';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS contact_method TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS meeting_type TEXT NOT NULL DEFAULT 'meet',
  ADD COLUMN IF NOT EXISTS meet_link TEXT,
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- CHECK constraints
DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT chk_contact_method
    CHECK (contact_method IN ('email', 'sms', 'both'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT chk_meeting_type
    CHECK (meeting_type IN ('meet', 'phone'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partial index for reminder cron: find upcoming confirmed bookings needing reminders
CREATE INDEX IF NOT EXISTS idx_bookings_pending_reminders
  ON bookings (datetime)
  WHERE status = 'confirmed' AND reminder_sent = FALSE;
