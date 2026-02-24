'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function cancelSession(
  enrollmentId: string,
  sessionNumber: number,
  reason?: string
): Promise<{
  cancellationId?: string;
  groupSizeType?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc('cancel_session', {
    p_enrollment_id: enrollmentId,
    p_session_number: sessionNumber,
    p_reason: reason || null,
    p_cancelled_by: user.id,
  });

  if (error) {
    // Parse Postgres error messages into user-friendly strings
    const msg = error.message || 'Unknown error';
    if (msg.includes('not active')) return { error: 'This enrollment is no longer active.' };
    if (msg.includes('past or current-day')) return { error: 'You cannot cancel a past or same-day session.' };
    if (msg.includes('24 hours notice')) return { error: 'Small group sessions require at least 24 hours notice.' };
    if (msg.includes('already been cancelled')) return { error: 'This session has already been cancelled.' };
    if (msg.includes('Not authorized')) return { error: 'You are not authorized to cancel this session.' };
    return { error: msg };
  }

  // Fetch the cancellation to get group_size_type
  const { data: cancellation } = await adminClient
    .from('session_cancellations')
    .select('group_size_type')
    .eq('id', data)
    .single();

  return {
    cancellationId: data as string,
    groupSizeType: cancellation?.group_size_type || undefined,
  };
}
