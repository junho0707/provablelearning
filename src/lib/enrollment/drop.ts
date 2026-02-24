'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoEnrollFromWaitlist } from '@/lib/waitlist/auto-enroll';

export async function dropEnrollment(
  enrollmentId: string,
  reason: string,
  phase: number = 1
): Promise<{ success?: boolean; classId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const adminClient = createAdminClient();

  // Fetch class_id before drop (for waitlist notification)
  const { data: enrollment } = await adminClient
    .from('enrollments')
    .select('class_id')
    .eq('id', enrollmentId)
    .single();

  if (!enrollment) {
    return { error: 'Enrollment not found' };
  }

  const { error } = await adminClient.rpc('drop_enrollment', {
    p_enrollment_id: enrollmentId,
    p_reason: reason,
    p_dropped_by: user.id,
    p_phase: phase,
  });

  if (error) {
    const msg = error.message || 'Unknown error';
    if (msg.includes('not active')) return { error: 'This enrollment is not currently active.' };
    if (msg.includes('Not authorized')) return { error: 'You are not authorized to drop this enrollment.' };
    if (msg.includes('Cannot self-drop')) return { error: msg };
    if (msg.includes('not found')) return { error: 'Enrollment not found.' };
    return { error: msg };
  }

  // Belt-and-suspenders: immediately auto-enroll next waitlisted student (trigger also queues it)
  try {
    await autoEnrollFromWaitlist(enrollment.class_id);
  } catch {
    // Non-fatal: the queue trigger will handle it via cron
  }

  return { success: true, classId: enrollment.class_id };
}
