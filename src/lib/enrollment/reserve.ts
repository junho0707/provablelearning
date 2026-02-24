import { SupabaseClient } from '@supabase/supabase-js';

export async function reserveSeat(
  supabase: SupabaseClient,
  studentId: string,
  classId: string,
  courseId: string,
  agreementVersion: string,
  agreementTimestamp: string
): Promise<{ enrollmentId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('reserve_seat', {
    p_student_id: studentId,
    p_class_id: classId,
    p_course_id: courseId,
    p_agreement_version: agreementVersion,
    p_agreement_timestamp: agreementTimestamp,
  });

  if (error) {
    return { enrollmentId: null, error: error.message };
  }

  return { enrollmentId: data as string, error: null };
}
