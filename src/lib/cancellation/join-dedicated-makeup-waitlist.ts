'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function joinDedicatedMakeupWaitlist(
  cancellationId: string,
  makeupSessionId: string
): Promise<{ waitlistId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc('join_dedicated_makeup_waitlist', {
    p_cancellation_id: cancellationId,
    p_makeup_session_id: makeupSessionId,
    p_joined_by: user.id,
  });

  if (error) {
    const msg = error.message || 'Unknown error';
    if (msg.includes('not in cancelled status')) return { error: 'This cancellation has already been resolved.' };
    if (msg.includes('only for small/medium')) return { error: 'Dedicated makeup waitlist is only for small/medium groups.' };
    if (msg.includes('subject/level does not match')) return { error: 'This makeup session does not match your course.' };
    if (msg.includes('past session')) return { error: 'Cannot join waitlist for a past session.' };
    if (msg.includes('after the credit deadline')) return { error: 'This session is after your credit deadline.' };
    if (msg.includes('Not authorized')) return { error: 'You are not authorized.' };
    if (msg.includes('duplicate key') || msg.includes('uq_makeup_wl')) return { error: 'Already on the waitlist for this session.' };
    return { error: msg };
  }

  return { waitlistId: data as string };
}
