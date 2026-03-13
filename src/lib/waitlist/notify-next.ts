import { createAdminClient } from '@/lib/supabase/admin';
import { notifySgWaitlistNext } from './notify-sg-next';

export async function notifyNextOnWaitlist(classId: string) {
  const supabase = createAdminClient();

  // Find next waiting student (ordered by created_at for FIFO)
  const { data: next } = await supabase
    .from('waitlist')
    .select('id, student_id, students(user_id, users!students_user_id_fkey(full_name))')
    .eq('class_id', classId)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!next) return null;

  // Atomic update: only update if status is still 'waiting' (prevents race condition
  // where two concurrent calls both select the same student)
  const { data: updated, error } = await supabase
    .from('waitlist')
    .update({
      status: 'notified',
      notified_at: new Date().toISOString(),
    })
    .eq('id', next.id)
    .eq('status', 'waiting')
    .select('id')
    .single();

  if (error || !updated) {
    // Another process already notified this student — try the next one
    return notifyNextOnWaitlist(classId);
  }

  // TODO: Send email/SMS notification
  return next;
}

export async function expireStaleNotifications() {
  const supabase = createAdminClient();

  // 1. Expire SG/1:1 entries using offer_expires_at
  const { data: sgExpired } = await supabase
    .from('waitlist')
    .update({ status: 'expired' })
    .eq('status', 'notified')
    .not('offer_expires_at', 'is', null)
    .lt('offer_expires_at', new Date().toISOString())
    .select('id, class_id, preferred_class_ids');

  // 2. Expire LG entries using notified_at + 24h (no offer_expires_at)
  const { data: lgExpired } = await supabase
    .from('waitlist')
    .update({ status: 'expired' })
    .eq('status', 'notified')
    .is('offer_expires_at', null)
    .lt('notified_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .select('id, class_id');

  // 3. Cascade: notify next person for LG entries
  if (lgExpired) {
    const classIds = [...new Set(lgExpired.map((e) => e.class_id).filter(Boolean))];
    for (const classId of classIds) {
      await notifyNextOnWaitlist(classId!);
    }
  }

  // 4. Cascade: notify next person for SG/1:1 entries
  if (sgExpired) {
    const sgClassIds = new Set<string>();
    for (const entry of sgExpired) {
      const prefs = (entry.preferred_class_ids as string[]) || [];
      for (const id of prefs) {
        sgClassIds.add(id);
      }
    }
    for (const classId of sgClassIds) {
      await notifySgWaitlistNext(classId);
    }
  }

  return (sgExpired?.length || 0) + (lgExpired?.length || 0);
}
