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
