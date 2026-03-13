import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoBookMakeupFromWaitlist } from '@/lib/cancellation/auto-book-makeup';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const results = {
    expired: 0,
    noShows: 0,
    errors: [] as string[],
  };

  // 1. Expire large cancellations past session_date + 7 days (no makeup for LG)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: expirable } = await adminClient
    .from('session_cancellations')
    .select('id')
    .eq('status', 'cancelled')
    .eq('group_size_type', 'large')
    .lte('session_date', sevenDaysAgo);

  if (expirable && expirable.length > 0) {
    const ids = expirable.map((e) => e.id);
    await adminClient
      .from('session_cancellations')
      .update({ status: 'expired' })
      .in('id', ids);
    results.expired = ids.length;
  }

  // 2. Mark makeup no-shows: booked makeups where session_date < today
  // Then revert the parent cancellation from 'rescheduled' → 'cancelled'
  // so the student can book another makeup.
  const todayStr = new Date().toISOString().split('T')[0];

  const { data: noShows } = await adminClient
    .from('makeup_bookings')
    .select('id, cancellation_id, credit_id')
    .eq('status', 'booked')
    .lt('session_date', todayStr);

  if (noShows && noShows.length > 0) {
    // Fetch host_class_id + session_number before updating (for waitlist notification)
    const { data: noShowDetails } = await adminClient
      .from('makeup_bookings')
      .select('id, host_class_id, session_number')
      .in('id', noShows.map((n) => n.id));

    const ids = noShows.map((n) => n.id);
    const cancellationIds = noShows.filter((n) => n.cancellation_id).map((n) => n.cancellation_id as string);
    const creditIds = noShows.filter((n) => n.credit_id).map((n) => n.credit_id as string);

    await adminClient
      .from('makeup_bookings')
      .update({ status: 'no_show' })
      .in('id', ids);

    // For cancellation-based bookings: revert cancellation status so student can book another makeup
    if (cancellationIds.length > 0) {
      await adminClient
        .from('session_cancellations')
        .update({ status: 'cancelled' })
        .in('id', cancellationIds)
        .eq('status', 'rescheduled');
    }

    // For credit-based bookings: restore the credit
    for (const creditId of creditIds) {
      await adminClient
        .from('credits')
        .update({ remaining_amount: 1 })
        .eq('id', creditId);
    }

    // Auto-book next waiting student from makeup waitlist for each freed session
    if (noShowDetails) {
      const seen = new Set<string>();
      for (const d of noShowDetails) {
        if (d.host_class_id) {
          const key = `${d.host_class_id}:${d.session_number}`;
          if (!seen.has(key)) {
            seen.add(key);
            try {
              await autoBookMakeupFromWaitlist(d.host_class_id, d.session_number);
            } catch {
              // Non-fatal
            }
          }
        }
      }
    }

    results.noShows = ids.length;
  }

  // 3. Expire absent cancellations with no excuse past session_date + 7 days
  const { data: unexcused } = await adminClient
    .from('session_cancellations')
    .select('id')
    .eq('status', 'absent')
    .lte('session_date', sevenDaysAgo);

  if (unexcused && unexcused.length > 0) {
    const unexcusedIds = unexcused.map((u) => u.id);
    await adminClient
      .from('session_cancellations')
      .update({ status: 'expired' })
      .in('id', unexcusedIds);
    results.expired += unexcusedIds.length;
  }

  // 4. Expire makeup waitlist entries where session_date has passed
  const { data: expiredMakeupWl } = await adminClient
    .from('makeup_waitlist')
    .update({ status: 'expired' })
    .eq('status', 'waiting')
    .lt('session_date', todayStr)
    .select('id');

  return NextResponse.json({
    expired: results.expired,
    noShows: results.noShows,
    errors: results.errors,
    makeupWaitlistExpired: expiredMakeupWl?.length || 0,
  });
}
