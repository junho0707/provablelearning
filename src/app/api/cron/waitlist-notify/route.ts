import { NextResponse } from 'next/server';
import { dispatchWaitlistAutoEnroll } from '@/lib/waitlist/auto-enroll';
import { expireStaleNotifications } from '@/lib/waitlist/notify-next';
import { notifySgWaitlistNext } from '@/lib/waitlist/notify-sg-next';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // 1. Expire stale notifications first (cascades to next in line)
  let expiredCount = 0;
  try {
    expiredCount = await expireStaleNotifications();
  } catch (err) {
    console.error('expireStaleNotifications error:', err);
  }

  // 2. Process waitlist_notify_queue (catches drops, pg_cron deletions, etc.)
  let queueProcessed = 0;
  let enrolled = 0;
  let queueNotified = 0;

  const { data: queueItems } = await adminClient
    .from('waitlist_notify_queue')
    .select('id, class_id')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(50);

  if (queueItems && queueItems.length > 0) {
    const classIds = [...new Set(queueItems.map((q) => q.class_id))];

    for (const classId of classIds) {
      try {
        const result = await dispatchWaitlistAutoEnroll(classId);
        if (result.action === 'enrolled') enrolled++;
        if (result.action === 'notified') queueNotified++;
      } catch {
        // Non-fatal: will retry on next cron run
      }
    }

    const ids = queueItems.map((q) => q.id);
    await adminClient
      .from('waitlist_notify_queue')
      .update({ processed: true })
      .in('id', ids);

    queueProcessed = ids.length;
  }

  // 3. Sweep: find any classes with 'waiting' waitlist entries
  let sweepEnrolled = 0;
  let sweepNotified = 0;
  const { data: waitingEntries } = await adminClient
    .from('waitlist')
    .select('class_id, preferred_class_ids')
    .eq('status', 'waiting');

  if (waitingEntries && waitingEntries.length > 0) {
    // Single-slot entries (LG): class_id is set
    const singleSlotClassIds = [...new Set(
      waitingEntries
        .filter((w) => w.class_id != null)
        .map((w) => w.class_id as string)
    )];

    for (const classId of singleSlotClassIds) {
      try {
        const result = await dispatchWaitlistAutoEnroll(classId);
        if (result.action === 'enrolled') sweepEnrolled++;
      } catch {
        // Non-fatal
      }
    }

    // SG/1:1 entries: class_id is null, preferred_class_ids is set
    const sgClassIds = new Set<string>();
    for (const w of waitingEntries) {
      if (!w.class_id && w.preferred_class_ids) {
        for (const id of w.preferred_class_ids as string[]) {
          sgClassIds.add(id);
        }
      }
    }

    for (const classId of sgClassIds) {
      try {
        const notified = await notifySgWaitlistNext(classId);
        if (notified) sweepNotified++;
      } catch {
        // Non-fatal
      }
    }
  }

  return NextResponse.json({ expiredCount, queueProcessed, enrolled, queueNotified, sweepEnrolled, sweepNotified });
}
