import { SupabaseClient } from '@supabase/supabase-js';

export async function reserveSeat(
  supabase: SupabaseClient,
  studentId: string,
  slot1ClassId: string,
  slot2ClassId: string | null,
  agreementVersion: string,
  agreementTimestamp: string,
  payLater: boolean = false,
  startDate?: string,
  slot3ClassId?: string | null,
  subjectCategory?: string | null,
  subjectDetail?: string | null,
  slotsPerWeek?: number | null
): Promise<{ enrollmentId: string | null; error: string | null }> {
  const params: Record<string, unknown> = {
    p_student_id: studentId,
    p_slot_1_class_id: slot1ClassId,
    p_slot_2_class_id: slot2ClassId,
    p_agreement_version: agreementVersion,
    p_agreement_timestamp: agreementTimestamp,
    p_pay_later: payLater,
    p_slot_3_class_id: slot3ClassId ?? null,
    p_subject_category: subjectCategory ?? null,
    p_subject_detail: subjectDetail ?? null,
    p_slots_per_week: slotsPerWeek ?? 2,
  };
  if (startDate) {
    params.p_student_start_date = startDate;
  }
  const { data, error } = await supabase.rpc('reserve_seat', params);

  if (error) {
    return { enrollmentId: null, error: error.message };
  }

  return { enrollmentId: data as string, error: null };
}
