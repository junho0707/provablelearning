import { SupabaseClient } from '@supabase/supabase-js';
import type { GroupSizeType } from '@/lib/types';

interface ApplyCreditsResult {
  applied: number;
  error?: string;
}

export async function applyCredits(
  supabase: SupabaseClient,
  studentId: string,
  groupSizeType: GroupSizeType
): Promise<ApplyCreditsResult> {
  const { data, error } = await supabase.rpc('apply_credits', {
    p_student_id: studentId,
    p_group_size_type: groupSizeType,
  });

  if (error) {
    console.error('apply_credits RPC failed:', error.message);
    return { applied: 0, error: error.message };
  }

  return { applied: data as number };
}
