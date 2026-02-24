-- pg_cron jobs for automated cleanup
-- Note: pg_cron must be enabled in Supabase dashboard (Database > Extensions)

-- These jobs run inside the database and handle time-sensitive cleanup.
-- External API calls (Stripe, email) are handled by Vercel cron routes.

-- 1. Cleanup stale pending enrollments (older than 30 minutes)
-- Must match PENDING_ENROLLMENT_TTL_MINUTES in constants.ts and Stripe session expiry
-- Runs every minute
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-stale-pending',
      '* * * * *',
      $$DELETE FROM public.enrollments WHERE status = 'pending' AND created_at < now() - interval '30 minutes'$$
    );
  END IF;
END
$outer$;

-- 2. Expire waitlist notifications older than 24 hours
-- Runs every 5 minutes
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'expire-waitlist-notifications',
      '*/5 * * * *',
      $$UPDATE public.waitlist SET status = 'expired' WHERE status = 'notified' AND notified_at < now() - interval '24 hours'$$
    );
  END IF;
END
$outer$;
