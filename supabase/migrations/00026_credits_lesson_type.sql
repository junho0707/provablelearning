-- ============================================================
-- Migration 00026: Convert credits from money-based to lesson-type
-- Each credit row now represents lessons of a specific group_size_type.
-- amount/remaining_amount = number of lessons (not cents).
-- ============================================================

-- 1. Add group_size_type column to credits
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS group_size_type public.group_size_type NOT NULL DEFAULT 'large';

-- 2. Update apply_credits RPC: now takes group_size_type, deducts 1 lesson
CREATE OR REPLACE FUNCTION public.apply_credits(
  p_student_id UUID,
  p_group_size_type public.group_size_type
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit RECORD;
BEGIN
  -- Find earliest-expiring credit of matching type with remaining lessons
  SELECT id, remaining_amount
  INTO v_credit
  FROM public.credits
  WHERE student_id = p_student_id
    AND group_size_type = p_group_size_type
    AND remaining_amount > 0
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at ASC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Deduct 1 lesson
  UPDATE public.credits
    SET remaining_amount = remaining_amount - 1
    WHERE id = v_credit.id;

  -- Log credit consumption
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
    'credit_applied',
    jsonb_build_object(
      'student_id', p_student_id,
      'group_size_type', p_group_size_type,
      'amount_deducted', 1
    )
  );

  RETURN 1;
END;
$$;

-- 3. Update reverse_credits RPC: now takes group_size_type
CREATE OR REPLACE FUNCTION public.reverse_credits(
  p_student_id UUID,
  p_group_size_type public.group_size_type,
  p_reason TEXT DEFAULT 'Credits reversed'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_id UUID;
BEGIN
  -- Issue a new credit row to restore 1 lesson of the specified type
  INSERT INTO public.credits (student_id, amount, remaining_amount, group_size_type, reason)
  VALUES (p_student_id, 1, 1, p_group_size_type, p_reason)
  RETURNING id INTO v_credit_id;

  -- Log the reversal
  INSERT INTO public.admin_logs (admin_id, action, metadata_json)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
    'credit_reversed',
    jsonb_build_object(
      'student_id', p_student_id,
      'group_size_type', p_group_size_type,
      'credit_id', v_credit_id,
      'reason', p_reason
    )
  );

  RETURN v_credit_id;
END;
$$;

-- 4. Update credits_applied on enrollments to store group_size_type
-- Change from integer cents to integer lesson count (1 or 0)
-- The column already stores an integer, semantics just change to lesson count.
-- Add a group_size_type reference so we know what type of credit was applied.
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS credits_group_size_type public.group_size_type;
