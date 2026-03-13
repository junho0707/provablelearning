-- Migration 00089: Remove auto-credit issuance from cancellations
-- Credits are now only issued manually by admin (via refund requests).
-- The automatic credit_deadline → credit_issued flow is removed.

-- 1. Drop source_cancellation_id column from credits (no longer needed)
ALTER TABLE public.credits
  DROP COLUMN IF EXISTS source_cancellation_id;

-- 2. Update reverse_credits RPC to remove p_source_cancellation_id param
--    Keep p_subject and p_level for future admin flexibility.
DROP FUNCTION IF EXISTS public.reverse_credits(UUID, group_size_type, TEXT, subject_type, course_level, UUID);

CREATE OR REPLACE FUNCTION public.reverse_credits(
  p_student_id UUID,
  p_group_size_type group_size_type,
  p_reason TEXT DEFAULT 'Credits reversed',
  p_subject subject_type DEFAULT NULL,
  p_level course_level DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  INSERT INTO credits (student_id, group_size_type, amount, remaining_amount, reason, subject, level)
  VALUES (p_student_id, p_group_size_type, 1, 1, p_reason, p_subject, p_level);

  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  INSERT INTO admin_logs (admin_id, action, metadata_json)
  VALUES (
    v_admin_id,
    'credit_issued',
    jsonb_build_object(
      'student_id', p_student_id,
      'group_size_type', p_group_size_type::TEXT,
      'reason', p_reason
    )
  );
END;
$$;

-- 3. Convert any existing 'credit_issued' cancellations to 'expired'
--    (historical cleanup — these credits already exist independently)
UPDATE public.session_cancellations
SET status = 'expired'
WHERE status = 'credit_issued';
