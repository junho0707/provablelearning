-- Drop stale reserve_seat overloads that lack slot_3/subject params.
-- These were left behind because CREATE OR REPLACE creates a new function
-- when the argument list changes, rather than replacing the existing one.

DROP FUNCTION IF EXISTS reserve_seat(uuid, uuid, uuid, text, timestamptz, boolean);
DROP FUNCTION IF EXISTS reserve_seat(uuid, uuid, uuid, text, timestamptz, boolean, date);
