import { SupabaseClient } from '@supabase/supabase-js';

interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

export async function checkEligibility(
  supabase: SupabaseClient,
  studentId: string,
  slot1ClassId: string,
  slot2ClassId?: string | null,
  slot3ClassId?: string | null,
  options?: { skipCapCheck?: boolean }
): Promise<EligibilityResult> {
  // Fetch target class info
  const { data: slot1 } = await supabase
    .from('classes')
    .select('id, name, subject, level, group_size_type, meeting_day, meeting_time, class_start_date')
    .eq('id', slot1ClassId)
    .single();

  if (!slot1) {
    return { eligible: false, reason: 'Class not found.' };
  }

  // 1. LG: block enrollment after class starts
  if (slot1.group_size_type === 'large' && slot1.class_start_date) {
    if (new Date(slot1.class_start_date) <= new Date()) {
      return { eligible: false, reason: 'This class has already started.' };
    }
  }

  // 2a. Check for duplicate enrollment (slot_1, slot_2, or slot_3 matches this class)
  const { data: dupEnrollments } = await supabase
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .in('status', ['pending', 'active'])
    .or(`slot_1_class_id.eq.${slot1ClassId},slot_2_class_id.eq.${slot1ClassId},slot_3_class_id.eq.${slot1ClassId},class_id.eq.${slot1ClassId}`);

  if (dupEnrollments && dupEnrollments.length > 0) {
    return { eligible: false, reason: 'Already enrolled in this class.' };
  }

  // 2b. Check class_blocked (Phase 2 drop)
  const { data: blockedEnrollments } = await supabase
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_blocked', true)
    .or(`slot_1_class_id.eq.${slot1ClassId},slot_2_class_id.eq.${slot1ClassId},slot_3_class_id.eq.${slot1ClassId},class_id.eq.${slot1ClassId}`);

  if (blockedEnrollments && blockedEnrollments.length > 0) {
    return {
      eligible: false,
      reason: 'Re-enrollment into this class is not available. You may enroll in a different section.',
    };
  }



  // 3. Check time conflict with existing enrollments (slot_1)
  const { data: conflicts } = await supabase
    .from('enrollments')
    .select('class_id, classes!inner(meeting_day, meeting_time)')
    .eq('student_id', studentId)
    .in('status', ['pending', 'active'])
    .eq('classes.meeting_day', slot1.meeting_day)
    .eq('classes.meeting_time', slot1.meeting_time);

  if (conflicts && conflicts.length > 0) {
    return { eligible: false, reason: 'Time conflict with an existing enrollment.' };
  }

  // 4. Validate slot 2 if provided
  if (slot2ClassId) {
    const { data: slot2 } = await supabase
      .from('classes')
      .select('id, group_size_type, meeting_day, meeting_time')
      .eq('id', slot2ClassId)
      .single();

    if (!slot2) {
      return { eligible: false, reason: 'Slot 2 class not found.' };
    }

    // Only require same group_size_type (no subject/level match needed)
    if (slot2.group_size_type !== slot1.group_size_type) {
      return { eligible: false, reason: 'Both slots must have the same group size type.' };
    }

    // Slot 1 and Slot 2 must be on different days
    if (slot2.meeting_day === slot1.meeting_day) {
      return { eligible: false, reason: 'Slot 1 and Slot 2 must be on different days.' };
    }

    // Check slot2 time conflict
    const { data: slot2Conflicts } = await supabase
      .from('enrollments')
      .select('class_id, classes!inner(meeting_day, meeting_time)')
      .eq('student_id', studentId)
      .in('status', ['pending', 'active'])
      .eq('classes.meeting_day', slot2.meeting_day)
      .eq('classes.meeting_time', slot2.meeting_time);

    if (slot2Conflicts && slot2Conflicts.length > 0) {
      return { eligible: false, reason: 'Time conflict with an existing enrollment for slot 2.' };
    }

    // Check duplicate enrollment for slot2
    const { data: dupSlot2 } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', studentId)
      .in('status', ['pending', 'active'])
      .or(`slot_1_class_id.eq.${slot2ClassId},slot_2_class_id.eq.${slot2ClassId},slot_3_class_id.eq.${slot2ClassId},class_id.eq.${slot2ClassId}`);

    if (dupSlot2 && dupSlot2.length > 0) {
      return { eligible: false, reason: 'Already enrolled in slot 2 class.' };
    }
  }

  // 5. Validate slot 3 if provided
  if (slot3ClassId) {
    const { data: slot3 } = await supabase
      .from('classes')
      .select('id, group_size_type, meeting_day, meeting_time')
      .eq('id', slot3ClassId)
      .single();

    if (!slot3) {
      return { eligible: false, reason: 'Slot 3 class not found.' };
    }

    if (slot3.group_size_type !== slot1.group_size_type) {
      return { eligible: false, reason: 'All slots must have the same group size type.' };
    }

    // Check slot3 time conflict
    const { data: slot3Conflicts } = await supabase
      .from('enrollments')
      .select('class_id, classes!inner(meeting_day, meeting_time)')
      .eq('student_id', studentId)
      .in('status', ['pending', 'active'])
      .eq('classes.meeting_day', slot3.meeting_day)
      .eq('classes.meeting_time', slot3.meeting_time);

    if (slot3Conflicts && slot3Conflicts.length > 0) {
      return { eligible: false, reason: 'Time conflict with an existing enrollment for slot 3.' };
    }

    // Check duplicate enrollment for slot3
    const { data: dupSlot3 } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', studentId)
      .in('status', ['pending', 'active'])
      .or(`slot_1_class_id.eq.${slot3ClassId},slot_2_class_id.eq.${slot3ClassId},slot_3_class_id.eq.${slot3ClassId},class_id.eq.${slot3ClassId}`);

    if (dupSlot3 && dupSlot3.length > 0) {
      return { eligible: false, reason: 'Already enrolled in slot 3 class.' };
    }
  }

  return { eligible: true };
}
