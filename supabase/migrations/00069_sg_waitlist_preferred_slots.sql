-- Migration 00069: SG Waitlist Preferred Slots
-- Adds support for dual-slot SG waitlist entries where students select all
-- acceptable time slots (>=2). Auto-enrollment picks any 2 open slots atomically.

-- =============================================================================
-- 1. Add preferred_class_ids column
-- =============================================================================
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS preferred_class_ids UUID[];

-- =============================================================================
-- 2. Make class_id nullable (SG entries will have class_id=NULL)
-- =============================================================================
ALTER TABLE public.waitlist ALTER COLUMN class_id DROP NOT NULL;

-- =============================================================================
-- 3. Replace unique index (split LG/1:1 vs SG)
-- =============================================================================
-- Drop the existing unique index
DROP INDEX IF EXISTS public.uq_waitlist_student_class_active;

-- Recreate for LG/1:1 entries (class_id IS NOT NULL)
CREATE UNIQUE INDEX uq_waitlist_student_class_active
  ON public.waitlist (student_id, class_id)
  WHERE status IN ('waiting', 'notified') AND class_id IS NOT NULL;

-- =============================================================================
-- 4. CHECK constraint: exactly one of class_id or preferred_class_ids must be set
-- =============================================================================
ALTER TABLE public.waitlist ADD CONSTRAINT chk_waitlist_slot_type CHECK (
  (class_id IS NOT NULL AND preferred_class_ids IS NULL)
  OR
  (class_id IS NULL AND preferred_class_ids IS NOT NULL AND array_length(preferred_class_ids, 1) >= 2)
);

-- =============================================================================
-- 5. GIN index for array containment queries
-- =============================================================================
CREATE INDEX idx_waitlist_preferred_class_ids
  ON public.waitlist USING GIN (preferred_class_ids)
  WHERE preferred_class_ids IS NOT NULL;

-- =============================================================================
-- 6. Update trigger fn_queue_waitlist_notification
-- Now also queues slot_1_class_id and slot_2_class_id (deduped)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_queue_waitlist_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_ids UUID[];
  v_cid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Collect all class IDs from the deleted enrollment (deduped)
    v_class_ids := ARRAY(
      SELECT DISTINCT unnest FROM unnest(ARRAY[
        OLD.class_id, OLD.slot_1_class_id, OLD.slot_2_class_id
      ]) WHERE unnest IS NOT NULL
    );
    FOREACH v_cid IN ARRAY v_class_ids LOOP
      INSERT INTO waitlist_notify_queue (class_id) VALUES (v_cid);
    END LOOP;
    RETURN OLD;
  END IF;

  -- UPDATE: status changed to canceled or refunded
  IF TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status IN ('canceled', 'refunded')
  THEN
    v_class_ids := ARRAY(
      SELECT DISTINCT unnest FROM unnest(ARRAY[
        NEW.class_id, NEW.slot_1_class_id, NEW.slot_2_class_id
      ]) WHERE unnest IS NOT NULL
    );
    FOREACH v_cid IN ARRAY v_class_ids LOOP
      INSERT INTO waitlist_notify_queue (class_id) VALUES (v_cid);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 7. RPC: auto_enroll_sg_from_waitlist
-- For SG waitlist entries with preferred_class_ids: find first FIFO entry
-- with >=2 preferred slots having capacity, then auto-enroll via reserve_seat.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_enroll_sg_from_waitlist(p_class_id UUID)
RETURNS TABLE(student_id UUID, enrollment_id UUID, waitlist_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_admin_id UUID;
  v_enrollment_id UUID;
  v_open_slots UUID[];
  v_pref_id UUID;
  v_current_count INTEGER;
  v_capacity INTEGER;
  v_dup_count INTEGER;
  v_slot1 UUID;
  v_slot2 UUID;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  -- Loop through SG waitlist entries that include p_class_id in their preferred list
  FOR v_entry IN
    SELECT w.id, w.student_id, w.agreement_version, w.agreement_timestamp,
           w.preferred_class_ids
    FROM waitlist w
    WHERE w.class_id IS NULL
      AND w.preferred_class_ids @> ARRAY[p_class_id]
      AND w.status = 'waiting'
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    -- Skip entries without agreement
    IF v_entry.agreement_version IS NULL OR v_entry.agreement_timestamp IS NULL THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Check: no duplicate SG enrollment in any of the preferred classes
    SELECT COUNT(*) INTO v_dup_count
    FROM enrollments enr
    WHERE enr.student_id = v_entry.student_id
      AND enr.status IN ('pending', 'active')
      AND (
        enr.slot_1_class_id = ANY(v_entry.preferred_class_ids)
        OR enr.slot_2_class_id = ANY(v_entry.preferred_class_ids)
      );

    IF v_dup_count > 0 THEN
      UPDATE waitlist SET status = 'expired' WHERE id = v_entry.id;
      CONTINUE;
    END IF;

    -- Find all preferred classes with open capacity
    v_open_slots := ARRAY[]::UUID[];
    FOREACH v_pref_id IN ARRAY v_entry.preferred_class_ids LOOP
      SELECT cl.capacity INTO v_capacity
      FROM classes cl
      WHERE cl.id = v_pref_id AND cl.active = true;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      SELECT COUNT(*) INTO v_current_count
      FROM enrollments enr
      WHERE (enr.slot_1_class_id = v_pref_id OR enr.slot_2_class_id = v_pref_id
             OR (enr.slot_1_class_id IS NULL AND enr.class_id = v_pref_id))
        AND enr.status IN ('pending', 'active');

      IF v_current_count < v_capacity THEN
        v_open_slots := array_append(v_open_slots, v_pref_id);
      END IF;
    END LOOP;

    -- Need at least 2 open slots for SG dual-slot enrollment
    IF array_length(v_open_slots, 1) IS NULL OR array_length(v_open_slots, 1) < 2 THEN
      -- Not enough open slots — leave waiting for next cycle
      CONTINUE;
    END IF;

    -- Pick first 2 open slots
    v_slot1 := v_open_slots[1];
    v_slot2 := v_open_slots[2];

    -- Attempt reserve_seat for atomic dual-slot enrollment
    BEGIN
      v_enrollment_id := reserve_seat(
        p_student_id := v_entry.student_id,
        p_slot_1_class_id := v_slot1,
        p_slot_2_class_id := v_slot2,
        p_agreement_version := v_entry.agreement_version,
        p_agreement_timestamp := v_entry.agreement_timestamp,
        p_pay_later := true
      );
    EXCEPTION WHEN OTHERS THEN
      -- Race condition or other error: leave entry waiting
      CONTINUE;
    END;

    -- Mark waitlist entry as converted
    UPDATE waitlist SET status = 'converted' WHERE id = v_entry.id;

    -- Log
    INSERT INTO admin_logs (admin_id, action, metadata_json)
    VALUES (
      v_admin_id,
      'waitlist_sg_auto_enrolled',
      jsonb_build_object(
        'enrollment_id', v_enrollment_id,
        'student_id', v_entry.student_id,
        'slot_1_class_id', v_slot1,
        'slot_2_class_id', v_slot2,
        'waitlist_id', v_entry.id
      )
    );

    student_id := v_entry.student_id;
    enrollment_id := v_enrollment_id;
    waitlist_id := v_entry.id;
    RETURN NEXT;
    RETURN;
  END LOOP;

  -- No eligible student found
  RETURN;
END;
$$;
