import { NextResponse } from 'next/server';
import { autoEnrollFromWaitlist } from '@/lib/waitlist/auto-enroll';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Process waitlist_notify_queue (catches drops, pg_cron deletions, etc.)
  const adminClient = createAdminClient();
  let queueProcessed = 0;
  let enrolled = 0;

  const { data: queueItems } = await adminClient
    .from('waitlist_notify_queue')
    .select('id, class_id')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(50);

  if (queueItems && queueItems.length > 0) {
    // Dedupe by class_id
    const classIds = [...new Set(queueItems.map((q) => q.class_id))];

    for (const classId of classIds) {
      try {
        const result = await autoEnrollFromWaitlist(classId);
        if (result) enrolled++;
      } catch {
        // Non-fatal: will retry on next cron run
      }
    }

    // Mark all as processed
    const ids = queueItems.map((q) => q.id);
    await adminClient
      .from('waitlist_notify_queue')
      .update({ processed: true })
      .in('id', ids);

    queueProcessed = ids.length;
  }

  // Sweep: find any classes with 'waiting' waitlist entries that have open capacity.
  // Catches edge cases where auto-enroll wasn't triggered (e.g. old bugs, race conditions).
  let sweepEnrolled = 0;
  const { data: waitingEntries } = await adminClient
    .from('waitlist')
    .select('class_id')
    .eq('status', 'waiting');

  if (waitingEntries && waitingEntries.length > 0) {
    const waitingClassIds = [...new Set(waitingEntries.map((w) => w.class_id))];

    for (const classId of waitingClassIds) {
      try {
        const result = await autoEnrollFromWaitlist(classId);
        if (result) sweepEnrolled++;
      } catch {
        // Non-fatal
      }
    }
  }

  return NextResponse.json({ queueProcessed, enrolled, sweepEnrolled });
}
