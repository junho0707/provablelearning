-- Add Google Calendar event ID to cohorts (renamed to classes in migration 00032) for schedule blocks
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS google_calendar_event_id text;
