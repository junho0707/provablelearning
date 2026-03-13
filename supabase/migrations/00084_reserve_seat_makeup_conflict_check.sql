-- Migration 00084: Auto-cancel conflicting sessions on enrollment
--
-- When a new student enrolls and fills a slot to capacity, any session that
-- already has a makeup booking would exceed capacity. Instead of blocking
-- enrollment, we auto-cancel those sessions for the new student and grant
-- an immediate credit so they can book any available session.
--
-- This is done via a new RPC called after reserve_seat succeeds.

CREATE OR REPLACE FUNCTION public.resolve_enrollment_makeup_conflicts(
  p_enrollment_id UUID,
  p_cancelled_by UUID
)
RETURNS TABLE(
  conflict_class_id UUID,
  conflict_session_number INTEGER,
  conflict_session_date DATE,
  credit_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment RECORD;
  v_slot_class_ids UUID[];
  v_slot_class RECORD;
  v_session_date DATE;
  v_session_num INTEGER;
  v_enrolled_count INTEGER;
  v_makeup_count INTEGER;
  v_cancellation_id UUID;
  v_credit_id UUID;
  v_admin_id UUID;
BEGIN
  -- Fetch enrollment
  SELECT e.id, e.student_id, e.slot_1_class_id, e.slot_2_class_id, e.slot_3_class_id,
         e.student_start_date, e.slots_per_week
  INTO v_enrollment
  FROM enrollments e
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT u.id INTO v_admin_id FROM users u WHERE u.role = 'admin' LIMIT 1;

  -- Build array of slot class IDs
  v_slot_class_ids := ARRAY[]::UUID[];
  IF v_enrollment.slot_1_class_id IS NOT NULL THEN
    v_slot_class_ids := v_slot_class_ids || v_enrollment.slot_1_class_id;
  END IF;
  IF v_enrollment.slot_2_class_id IS NOT NULL THEN
    v_slot_class_ids := v_slot_class_ids || v_enrollment.slot_2_class_id;
  END IF;
  IF v_enrollment.slot_3_class_id IS NOT NULL THEN
    v_slot_class_ids := v_slot_class_ids || v_enrollment.slot_3_class_id;
  END IF;

  -- For each slot class, check each session (1-4) for makeup conflicts
  FOR v_slot_class IN
    SELECT cl.id, cl.capacity, cl.group_size_type, cl.meeting_day
    FROM classes cl
    WHERE cl.id = ANY(v_slot_class_ids)
      AND cl.group_size_type != 'large'
  LOOP
    FOR v_session_num IN 1..4 LOOP
      -- Compute session date for this slot
      v_session_date := compute_session_date(
        v_enrollment.student_start_date,
        v_slot_class.meeting_day,
        v_session_num
      );

      -- Skip past sessions
      IF v_session_date <= CURRENT_DATE THEN
        CONTINUE;
      END IF;

      -- Count enrolled students for this class
      SELECT COUNT(*) INTO v_enrolled_count
      FROM enrollments enr
      WHERE (enr.slot_1_class_id = v_slot_class.id
             OR enr.slot_2_class_id = v_slot_class.id
             OR enr.slot_3_class_id = v_slot_class.id
             OR (enr.slot_1_class_id IS NULL AND enr.class_id = v_slot_class.id))
        AND enr.status IN ('pending', 'active');

      -- Count makeup bookings for this specific session date
      SELECT COUNT(*) INTO v_makeup_count
      FROM makeup_bookings mb
      WHERE mb.host_class_id = v_slot_class.id
        AND mb.session_date = v_session_date
        AND mb.status = 'booked';

      -- If total would exceed capacity, auto-cancel this session for the new student
      IF v_makeup_count > 0 AND (v_enrolled_count + v_makeup_count) > v_slot_class.capacity THEN
        -- Determine the enrollment-level session number
        -- For 2-slot: slot_1 sessions are odd (1,3,5,7), slot_2 sessions are even (2,4,6,8)
        -- For 3-slot: round-robin (slot_1: 1,4,7,10; slot_2: 2,5,8,11; slot_3: 3,6,9,12)
        DECLARE
          v_enrollment_session_num INTEGER;
        BEGIN
          IF v_enrollment.slot_3_class_id IS NOT NULL THEN
            -- 3-slot round-robin
            IF v_slot_class.id = v_enrollment.slot_1_class_id THEN
              v_enrollment_session_num := (v_session_num - 1) * 3 + 1;
            ELSIF v_slot_class.id = v_enrollment.slot_2_class_id THEN
              v_enrollment_session_num := (v_session_num - 1) * 3 + 2;
            ELSE
              v_enrollment_session_num := (v_session_num - 1) * 3 + 3;
            END IF;
          ELSIF v_enrollment.slot_2_class_id IS NOT NULL THEN
            -- 2-slot interleave
            IF v_slot_class.id = v_enrollment.slot_1_class_id THEN
              v_enrollment_session_num := (v_session_num - 1) * 2 + 1;
            ELSE
              v_enrollment_session_num := (v_session_num - 1) * 2 + 2;
            END IF;
          ELSE
            -- 1-slot
            v_enrollment_session_num := v_session_num;
          END IF;

          -- Insert session cancellation
          INSERT INTO session_cancellations (
            enrollment_id, student_id, class_id,
            session_number, session_date, group_size_type,
            reason, cancelled_by, status, credit_deadline,
            cancelled_by_type
          ) VALUES (
            p_enrollment_id, v_enrollment.student_id, v_slot_class.id,
            v_enrollment_session_num, v_session_date, v_slot_class.group_size_type,
            'Auto-cancelled: session has an existing makeup booking at capacity',
            COALESCE(p_cancelled_by, v_admin_id),
            'credit_issued', NULL,
            'system'
          )
          RETURNING id INTO v_cancellation_id;

          -- Grant credit immediately
          INSERT INTO credits (
            student_id, amount, remaining_amount,
            group_size_type, reason,
            source_cancellation_id,
            expires_at
          ) VALUES (
            v_enrollment.student_id, 1, 1,
            v_slot_class.group_size_type,
            'Auto-credit: enrollment conflict with existing makeup on ' || v_session_date::TEXT,
            v_cancellation_id,
            (v_session_date + INTERVAL '30 days')::TIMESTAMPTZ
          )
          RETURNING id INTO v_credit_id;

          -- Log
          INSERT INTO admin_logs (admin_id, action, metadata_json)
          VALUES (
            COALESCE(p_cancelled_by, v_admin_id),
            'enrollment_makeup_conflict_resolved',
            jsonb_build_object(
              'enrollment_id', p_enrollment_id,
              'student_id', v_enrollment.student_id,
              'class_id', v_slot_class.id,
              'session_date', v_session_date,
              'session_number', v_enrollment_session_num,
              'cancellation_id', v_cancellation_id,
              'credit_id', v_credit_id
            )
          );

          -- Return conflict info
          conflict_class_id := v_slot_class.id;
          conflict_session_number := v_enrollment_session_num;
          conflict_session_date := v_session_date;
          credit_id := v_credit_id;
          RETURN NEXT;
        END;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
