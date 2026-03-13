import { SupabaseClient } from '@supabase/supabase-js';

export async function joinWaitlist(
  supabase: SupabaseClient,
  studentId: string,
  classId: string,
  agreementVersion: string,
  agreementTimestamp: string
): Promise<{ waitlistId: string | null; error: string | null }> {
  // Check if already on waitlist
  const { data: existing } = await supabase
    .from('waitlist')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .in('status', ['waiting', 'notified'])
    .single();

  if (existing) {
    return { waitlistId: null, error: 'Already on waitlist for this class.' };
  }

  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      student_id: studentId,
      class_id: classId,
      status: 'waiting',
      agreement_version: agreementVersion,
      agreement_timestamp: agreementTimestamp,
    })
    .select('id')
    .single();

  if (error) return { waitlistId: null, error: error.message };
  return { waitlistId: data.id, error: null };
}

export async function joinSgWaitlist(
  supabase: SupabaseClient,
  studentId: string,
  preferredClassIds: string[],
  agreementVersion: string,
  agreementTimestamp: string
): Promise<{ waitlistId: string | null; error: string | null }> {
  if (preferredClassIds.length < 2) {
    return { waitlistId: null, error: 'Select at least 2 time slots for Small Group.' };
  }
  if (preferredClassIds.length > 4) {
    return { waitlistId: null, error: 'You can select a maximum of 4 time slots.' };
  }

  // One active SG waitlist entry per student
  const { data: existingEntries } = await supabase
    .from('waitlist')
    .select('id')
    .eq('student_id', studentId)
    .is('class_id', null)
    .in('status', ['waiting', 'notified']);

  if (existingEntries && existingEntries.length > 0) {
    return { waitlistId: null, error: 'Already on the waitlist.' };
  }

  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      student_id: studentId,
      class_id: null,
      preferred_class_ids: preferredClassIds,
      status: 'waiting',
      agreement_version: agreementVersion,
      agreement_timestamp: agreementTimestamp,
    })
    .select('id')
    .single();

  if (error) return { waitlistId: null, error: error.message };
  return { waitlistId: data.id, error: null };
}
