-- Atomic FIFO credit deduction with row-level locking
CREATE OR REPLACE FUNCTION public.apply_credits(
  p_student_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER := p_amount;
  v_deducted INTEGER := 0;
  v_credit RECORD;
BEGIN
  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  FOR v_credit IN
    SELECT id, remaining_amount
    FROM public.credits
    WHERE student_id = p_student_id
      AND remaining_amount > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at ASC NULLS LAST
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    IF v_credit.remaining_amount >= v_remaining THEN
      UPDATE public.credits
        SET remaining_amount = remaining_amount - v_remaining
        WHERE id = v_credit.id;
      v_deducted := v_deducted + v_remaining;
      v_remaining := 0;
    ELSE
      UPDATE public.credits
        SET remaining_amount = 0
        WHERE id = v_credit.id;
      v_deducted := v_deducted + v_credit.remaining_amount;
      v_remaining := v_remaining - v_credit.remaining_amount;
    END IF;
  END LOOP;

  -- Log credit consumption to admin_logs
  IF v_deducted > 0 THEN
    INSERT INTO public.admin_logs (admin_id, action, metadata_json)
    VALUES (
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
      'credit_applied',
      jsonb_build_object(
        'student_id', p_student_id,
        'amount_requested', p_amount,
        'amount_deducted', v_deducted
      )
    );
  END IF;

  RETURN v_deducted;
END;
$$;
