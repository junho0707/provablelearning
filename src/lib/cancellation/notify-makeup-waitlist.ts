import { createAdminClient } from '@/lib/supabase/admin';

export async function notifyMakeupWaitlist(
  hostClassId: string,
  sessionNumber: number
): Promise<number> {
  const adminClient = createAdminClient();

  // Find all waiting entries for this host class + session
  const { data: waiting } = await adminClient
    .from('makeup_waitlist')
    .select('id')
    .eq('host_class_id', hostClassId)
    .eq('session_number', sessionNumber)
    .eq('status', 'waiting');

  if (!waiting || waiting.length === 0) return 0;

  const ids = waiting.map((w) => w.id);

  // Notify all (first-come-first-served: all get notified, first to book wins)
  const { error } = await adminClient
    .from('makeup_waitlist')
    .update({
      status: 'notified',
      notified_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (error) return 0;

  // TODO: Send email/SMS notifications to all waitlisted students

  return ids.length;
}
