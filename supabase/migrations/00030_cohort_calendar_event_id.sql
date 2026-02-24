-- Add Google Calendar event ID to classes (renamed from cohorts) for schedule blocks
ALTER TABLE classes ADD COLUMN IF NOT EXISTS google_calendar_event_id text;
