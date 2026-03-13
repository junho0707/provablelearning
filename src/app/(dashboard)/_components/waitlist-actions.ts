'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyNextOnWaitlist } from '@/lib/waitlist/notify-next';
import { notifySgWaitlistNext } from '@/lib/waitlist/notify-sg-next';
import { revalidatePath } from 'next/cache';

async function verifyOwnership(waitlistId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const adminClient = createAdminClient();

  const { data: entry } = await adminClient
    .from('waitlist')
    .select('id, student_id, class_id, preferred_class_ids, status, offer_expires_at')
    .eq('id', waitlistId)
    .single();

  if (!entry) return { error: 'Waitlist entry not found' };

  // Verify user owns this student (parent or self)
  const { data: student } = await adminClient
    .from('students')
    .select('id, user_id, parent_id')
    .eq('id', entry.student_id)
    .single();

  if (!student) return { error: 'Student not found' };
  if (student.user_id !== user.id && student.parent_id !== user.id) {
    return { error: 'Not authorized' };
  }

  return { entry, adminClient };
}

export async function leaveWaitlistAction(waitlistId: string): Promise<{ success?: boolean; error?: string }> {
  const result = await verifyOwnership(waitlistId);
  if ('error' in result && result.error) return { error: result.error };

  const { entry, adminClient } = result as { entry: NonNullable<typeof result.entry>; adminClient: ReturnType<typeof createAdminClient> };

  if (entry.status !== 'waiting' && entry.status !== 'notified') {
    return { error: 'Can only leave waitlist entries that are waiting or have a pending offer' };
  }

  const wasNotified = entry.status === 'notified';
  const classId = entry.class_id as string | null;
  const preferredClassIds = (entry.preferred_class_ids as string[] | null) || [];

  // Delete the entry
  const { error } = await adminClient
    .from('waitlist')
    .delete()
    .eq('id', waitlistId);

  if (error) return { error: 'Failed to leave waitlist' };

  // Cascade: if was notified, notify next person
  if (wasNotified) {
    if (classId) {
      // LG entry
      await notifyNextOnWaitlist(classId);
    } else if (preferredClassIds.length > 0) {
      // SG/1:1 entry — notify next for each preferred class
      for (const cid of preferredClassIds) {
        await notifySgWaitlistNext(cid);
      }
    }
  }

  revalidatePath('/parent');
  revalidatePath('/student');
  return { success: true };
}

export async function updatePreferredSlotsAction(
  waitlistId: string,
  newPreferredClassIds: string[]
): Promise<{ success?: boolean; error?: string }> {
  if (newPreferredClassIds.length < 2) {
    return { error: 'Must select at least 2 preferred slots' };
  }

  const result = await verifyOwnership(waitlistId);
  if ('error' in result && result.error) return { error: result.error };

  const { entry, adminClient } = result as { entry: NonNullable<typeof result.entry>; adminClient: ReturnType<typeof createAdminClient> };

  if (!entry.preferred_class_ids) {
    return { error: 'Cannot edit slots on a Large Group waitlist entry' };
  }

  if (entry.status !== 'waiting') {
    return { error: 'Can only edit slots on waiting entries. Leave and re-join if you have an active offer.' };
  }

  const { error } = await adminClient
    .from('waitlist')
    .update({
      preferred_class_ids: newPreferredClassIds,
    })
    .eq('id', waitlistId);

  if (error) return { error: 'Failed to update preferred slots' };

  revalidatePath('/parent');
  revalidatePath('/student');
  return { success: true };
}
