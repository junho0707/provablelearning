import { SupabaseClient } from '@supabase/supabase-js';
import type { GroupSizeType } from '@/lib/types';

export type CreditBalances = Record<GroupSizeType, number>;

export async function getCreditBalance(
  supabase: SupabaseClient,
  studentId: string
): Promise<CreditBalances> {
  const { data } = await supabase
    .from('credits')
    .select('group_size_type, remaining_amount')
    .eq('student_id', studentId)
    .gt('remaining_amount', 0)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

  const balances: CreditBalances = {
    one_on_one: 0,
    small: 0,
    medium: 0,
    large: 0,
  };

  if (!data) return balances;

  for (const c of data) {
    const type = c.group_size_type as GroupSizeType;
    if (type in balances) {
      balances[type] += c.remaining_amount;
    }
  }

  return balances;
}
