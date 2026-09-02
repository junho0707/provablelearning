-- 0009_notifications — idempotent reminder flags (TASK-NOTIFY-001).
--
-- One boolean per reminder kind, flipped only after a successful send — the cron scans for
-- `false` in the relevant window, so a rerun before the flag flips is the only way to double-send,
-- and re-running after it flips is a guaranteed no-op (contract 08, `GET /api/cron/session-reminders`).

alter table bookings add column reminded_24h boolean not null default false;
alter table bookings add column reminded_1h boolean not null default false;
