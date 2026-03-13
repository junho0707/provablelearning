import { createAdminClient } from '@/lib/supabase/admin';
import { sendWaitlistOfferEmail } from './send-waitlist-notification';

/**
 * For SG/1:1 waitlist: find the next waiting entry whose preferred_class_ids
 * include `classId`, check if at least 2 of their preferred slots have capacity,
 * and if so mark them as notified with a 3-day offer window.
 *
 * Returns true if someone was notified.
 */
export async function notifySgWaitlistNext(classId: string): Promise<boolean> {
  const supabase = createAdminClient();

  // Find all waiting SG/1:1 entries that include this classId in preferred_class_ids
  const { data: entries } = await supabase
    .from('waitlist')
    .select('id, student_id, preferred_class_ids')
    .is('class_id', null)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  if (!entries || entries.length === 0) return false;

  // Filter to entries whose preferred_class_ids contain the triggering classId
  const relevantEntries = entries.filter((e) => {
    const prefs = (e.preferred_class_ids as string[]) || [];
    return prefs.includes(classId);
  });

  if (relevantEntries.length === 0) return false;

  // Get current enrollment counts for capacity checks
  const { data: enrollmentRows } = await supabase
    .from('enrollments')
    .select('slot_1_class_id, slot_2_class_id, class_id')
    .in('status', ['pending', 'active']);

  function countForClass(targetId: string): number {
    let count = 0;
    (enrollmentRows || []).forEach((row) => {
      if (row.slot_1_class_id === targetId || row.slot_2_class_id === targetId || row.class_id === targetId) count++;
    });
    return count;
  }

  for (const entry of relevantEntries) {
    const prefs = (entry.preferred_class_ids as string[]) || [];

    // Check which preferred slots have capacity
    const openSlotIds: string[] = [];
    for (const prefId of prefs) {
      const { data: cls } = await supabase
        .from('classes')
        .select('id, capacity')
        .eq('id', prefId)
        .single();

      if (cls && countForClass(cls.id) < cls.capacity) {
        openSlotIds.push(cls.id);
      }
    }

    // Need at least 2 open slots
    if (openSlotIds.length < 2) continue;

    // Notify this entry
    const offerExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('waitlist')
      .update({
        status: 'notified',
        notified_at: new Date().toISOString(),
        offer_expires_at: offerExpiresAt,
      })
      .eq('id', entry.id)
      .eq('status', 'waiting'); // optimistic lock

    if (error) continue; // race condition — try next

    // In-app notification (best-effort)
    try {
      const { data: student } = await supabase
        .from('students')
        .select('user_id, parent_id, full_name')
        .eq('id', entry.student_id)
        .single();

      const notifyUserId = student?.parent_id || student?.user_id;
      if (notifyUserId) {
        const studentName = student?.full_name || 'your student';
        await supabase.from('notifications').insert({
          user_id: notifyUserId,
          message: `A spot is available for ${studentName}! Accept within 3 days before it expires.`,
          type: 'enrollment',
        });
      }
    } catch (err) {
      console.error('Failed to insert waitlist notification:', err);
    }

    // Send email notification (best-effort)
    try {
      await sendWaitlistOfferEmail(supabase, entry.id, entry.student_id);
    } catch (err) {
      console.error('Failed to send waitlist offer email:', err);
    }

    return true;
  }

  return false;
}
