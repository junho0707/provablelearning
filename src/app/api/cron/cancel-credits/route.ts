import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoBookMakeupFromWaitlist } from '@/lib/cancellation/auto-book-makeup';
import { autoBookDedicatedMakeupFromWaitlist } from '@/lib/cancellation/auto-book-dedicated-makeup';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const results = {
    creditsIssued: 0,
    expired: 0,
    noShows: 0,
    errors: [] as string[],
  };

  // 1. Issue credits for small + medium + one_on_one past their credit deadline
  // credit_deadline = Sunday end-of-week (11:59:59 PM ET)
  const { data: eligible } = await adminClient
    .from('session_cancellations')
    .select('id, student_id, group_size_type')
    .eq('status', 'cancelled')
    .in('group_size_type', ['small', 'medium', 'one_on_one'])
    .not('credit_deadline', 'is', null)
    .lte('credit_deadline', new Date().toISOString());

  for (const c of eligible || []) {
    // For 1:1, issue non-expiring credit (no expires_at)
    const rpcParams: Record<string, unknown> = {
      p_student_id: c.student_id,
      p_group_size_type: c.group_size_type,
      p_reason: `Auto-credit for cancelled session (cancellation ${c.id})`,
    };

    const { error } = await adminClient.rpc('reverse_credits', rpcParams);

    if (error) {
      results.errors.push(`Credit issue failed for ${c.id}: ${error.message}`);
      continue;
    }

    // Update status to credit_issued
    const { error: updateError } = await adminClient
      .from('session_cancellations')
      .update({ status: 'credit_issued' })
      .eq('id', c.id);

    if (updateError) {
      results.errors.push(`Status update failed for ${c.id}: ${updateError.message}`);
      continue;
    }

    results.creditsIssued++;
  }

  // 2. Expire large cancellations past session_date + 7 days (no credit)
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

  // 3. Mark makeup no-shows: booked makeups where session_date < today
  // Then revert the parent cancellation from 'rescheduled' → 'cancelled'
  // so the credit deadline can fire normally.
  const todayStr = new Date().toISOString().split('T')[0];

  const { data: noShows } = await adminClient
    .from('makeup_bookings')
    .select('id, cancellation_id')
    .eq('status', 'booked')
    .lt('session_date', todayStr);

  if (noShows && noShows.length > 0) {
    // Fetch host_class_id + session_number + makeup_session_id before updating (for waitlist notification)
    const { data: noShowDetails } = await adminClient
      .from('makeup_bookings')
      .select('id, host_class_id, session_number, makeup_session_id')
      .in('id', noShows.map((n) => n.id));

    const ids = noShows.map((n) => n.id);
    const cancellationIds = noShows.map((n) => n.cancellation_id);

    await adminClient
      .from('makeup_bookings')
      .update({ status: 'no_show' })
      .in('id', ids);

    // Revert cancellation status so credit deadline processing picks them up
    await adminClient
      .from('session_cancellations')
      .update({ status: 'cancelled' })
      .in('id', cancellationIds)
      .eq('status', 'rescheduled');

    // Auto-book next waiting student from makeup waitlist for each freed session
    if (noShowDetails) {
      const seen = new Set<string>();
      for (const d of noShowDetails) {
        if (d.makeup_session_id) {
          // Dedicated makeup session
          const key = `dedicated:${d.makeup_session_id}`;
          if (!seen.has(key)) {
            seen.add(key);
            try {
              await autoBookDedicatedMakeupFromWaitlist(d.makeup_session_id);
            } catch {
              // Non-fatal
            }
          }
        } else if (d.host_class_id) {
          // Regular alternate session
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

  // 4. Expire makeup waitlist entries where session_date has passed
  const { data: expiredMakeupWl } = await adminClient
    .from('makeup_waitlist')
    .update({ status: 'expired' })
    .eq('status', 'waiting')
    .lt('session_date', todayStr)
    .select('id');

  return NextResponse.json({
    ...results,
    makeupWaitlistExpired: expiredMakeupWl?.length || 0,
  });
}
