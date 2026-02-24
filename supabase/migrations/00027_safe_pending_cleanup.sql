-- ============================================================
-- Migration 00027: Safe pending enrollment cleanup
-- Replaces raw DELETE cron job with an RPC that reverses
-- credits before deleting stale pending enrollments.
-- Also adds credit reversal to reconciliation of pending
-- enrollments with expired Stripe sessions.
-- ============================================================

-- RPC: Safely clean up stale pending enrollments
-- Reverses any applied credits before deleting
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_cleaned INTEGER := 0;
BEGIN
  FOR v_enrollment IN
    SELECT id, student_id, credits_applied, credits_group_size_type
    FROM enrollments
    WHERE status = 'pending'
      AND created_at < now() - interval '30 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Reverse credits if any were applied
    IF v_enrollment.credits_applied > 0 AND v_enrollment.credits_group_size_type IS NOT NULL THEN
      PERFORM reverse_credits(
        v_enrollment.student_id,
        v_enrollment.credits_group_size_type,
        'Stale pending enrollment cleaned up — credits reversed'
      );
    END IF;

    -- Delete the enrollment
    DELETE FROM enrollments WHERE id = v_enrollment.id AND status = 'pending';

    v_cleaned := v_cleaned + 1;
  END LOOP;

  -- Log if any were cleaned
  IF v_cleaned > 0 THEN
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      '00000000-0000-0000-0000-000000000000'::UUID,
      'stale_pending_cleanup',
      jsonb_build_object('cleaned_count', v_cleaned)
    );
  END IF;

  RETURN v_cleaned;
END;
$$;

-- Replace the pg_cron job to use the safe RPC instead of raw DELETE
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-stale-pending');
    PERFORM cron.schedule(
      'cleanup-stale-pending',
      '*/5 * * * *',
      $$SELECT public.cleanup_stale_pending()$$
    );
  END IF;
END
$outer$;
