import { createAdminClient } from '@/lib/supabase/admin';

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

  // Expire notifications older than 24 hours
  const { data: expired } = await supabase
    .from('waitlist')
    .update({ status: 'expired' })
    .eq('status', 'notified')
    .lt('notified_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .select('class_id');

  // For each expired notification, notify the next person
  if (expired) {
    const classIds = [...new Set(expired.map((e) => e.class_id))];
    for (const classId of classIds) {
      await notifyNextOnWaitlist(classId);
    }
  }

  return expired?.length || 0;
}
