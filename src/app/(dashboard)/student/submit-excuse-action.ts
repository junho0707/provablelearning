'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function submitExcuseNote(
  cancellationId: string,
  note: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };

  // Verify independent student owns this cancellation
  const adminClient = createAdminClient();
  const { data: cancellation } = await adminClient
    .from('session_cancellations')
    .select('student_id')
    .eq('id', cancellationId)
    .single();

  if (!cancellation) return { error: 'Cancellation not found' };

  const { data: student } = await adminClient
    .from('students')
    .select('user_id')
    .eq('id', cancellation.student_id)
    .single();

  if (!student || student.user_id !== user.id) {
    return { error: 'Not authorized' };
  }

  const { error } = await adminClient.rpc('submit_excuse_note', {
    p_cancellation_id: cancellationId,
    p_note: note,
    p_submitted_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath('/student');
  return {};
}
