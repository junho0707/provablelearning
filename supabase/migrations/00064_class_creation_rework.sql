-- Add new subject type for 1:1 combined classes
ALTER TYPE subject_type ADD VALUE IF NOT EXISTS 'digital_rw_math';

-- Add new level for 1:1 (no essentials/advanced distinction)
ALTER TYPE course_level ADD VALUE IF NOT EXISTS 'all_levels';

-- Add second meeting day/time for LG 2x/wk schedule
ALTER TABLE classes ADD COLUMN meeting_day_2 TEXT;
ALTER TABLE classes ADD COLUMN meeting_time_2 TIME;

-- Add second calendar event ID for LG classes
ALTER TABLE classes ADD COLUMN google_calendar_event_id_2 TEXT;

-- CHECK constraints that reference the new enum values are in 00065
-- (Postgres cannot use new enum values in the same transaction they are added)
