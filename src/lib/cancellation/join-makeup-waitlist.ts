'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function joinMakeupWaitlist(
  cancellationId: string,
  hostClassId: string,
  sessionDate: string
): Promise<{ waitlistId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc('join_makeup_waitlist', {
    p_cancellation_id: cancellationId,
    p_host_class_id: hostClassId,
    p_joined_by: user.id,
    p_session_date: sessionDate,
  });

  if (error) {
    const msg = error.message || 'Unknown error';
    if (msg.includes('not in cancelled status')) return { error: 'This cancellation has already been resolved.' };
    if (msg.includes('not available for 1:1')) return { error: 'Waitlist is not available for 1:1 sessions.' };
    if (msg.includes('same group size')) return { error: 'The alternate class must have the same group size.' };
    if (msg.includes('same class')) return { error: 'Cannot waitlist in your own class.' };
    if (msg.includes('outside enrollment window')) return { error: 'This session is outside your enrollment window.' };
    if (msg.includes('Too late')) return { error: 'Too late to join waitlist (cutoff is 6 hours before session).' };
    if (msg.includes('Not authorized')) return { error: 'You are not authorized.' };
    if (msg.includes('duplicate key') || msg.includes('uq_makeup_wl')) return { error: 'Already on the waitlist for this session.' };
    return { error: msg };
  }

  return { waitlistId: data as string };
}
