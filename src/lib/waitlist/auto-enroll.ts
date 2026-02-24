import { createAdminClient } from '@/lib/supabase/admin';

interface AutoEnrollResult {
  enrollment_id: string;
  student_id: string;
  waitlist_id: string;
}

export async function autoEnrollFromWaitlist(
  classId: string
): Promise<AutoEnrollResult | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('auto_enroll_from_waitlist', {
    p_class_id: classId,
  });

  if (error) {
    console.error('auto_enroll_from_waitlist RPC error:', error.message);
    return null;
  }

  // RPC returns a table; data is an array
  const rows = data as AutoEnrollResult[] | null;
  if (!rows || rows.length === 0) return null;

  return rows[0];
}
