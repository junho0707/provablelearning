import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClassCalendarBlock, deleteClassCalendarBlock } from '@/lib/google/calendar';
import { SESSIONS_PER_SLOT } from '@/lib/constants';

function formatGroupSize(type: string): string {
  const labels: Record<string, string> = {
    one_on_one: '1-on-1',
    small: 'Small',
    large: 'Large',
  };
  return labels[type] ?? type;
}

/** SG/1:1: enrollment_window_end + 4 weeks (Saturday) */
function calcRollingUntilDate(enrollmentWindowEnd: string | null): string | null {
  if (!enrollmentWindowEnd) return null;
  const end = new Date(enrollmentWindowEnd);
  const daysToSaturday = (6 - end.getDay() + 7) % 7;
  end.setDate(end.getDate() + daysToSaturday);
  end.setDate(end.getDate() + 28);
  return end.toISOString().split('T')[0];
}

function calcWeeksFromDates(startDate: string | null, endDate: string | null, fallback: number): number {
  if (!startDate || !endDate) return fallback;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks);
}

/**
 * POST /api/google/backfill-calendar
 * Creates Google Calendar blocks for all active classes that don't have one.
 * Admin-only endpoint.
 */
export async function POST() {
  console.log('[backfill-calendar] Starting...');

  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error('[backfill-calendar] Failed to create supabase client:', err);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }

  const adminClient = createAdminClient();

  // Verify admin
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  console.log('[backfill-calendar] Auth check:', user?.id ?? 'no user', authError?.message ?? 'ok');
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  console.log('[backfill-calendar] Role:', profile?.role);
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch all active classes without a calendar event
  const { data: classes, error } = await adminClient
    .from('classes')
    .select('id, name, subject, level, group_size_type, meeting_day, meeting_time, meeting_day_2, meeting_time_2, class_start_date, class_end_date, enrollment_window_start, enrollment_window_end, google_calendar_event_id, google_calendar_event_id_2')
    .eq('active', true)
    .is('google_calendar_event_id', null);

  if (error) {
    console.error('[backfill-calendar] DB error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[backfill-calendar] Found', classes?.length ?? 0, 'classes to backfill');

  if (!classes || classes.length === 0) {
    return NextResponse.json({ message: 'No classes need backfilling', created: 0 });
  }

  const results: { id: string; name: string; status: string }[] = [];

  for (const cls of classes) {
    const isRolling = cls.group_size_type === 'small' || cls.group_size_type === 'one_on_one';

    const calStartDate = isRolling
      ? (cls.enrollment_window_start || new Date().toISOString().split('T')[0])
      : (cls.class_start_date || cls.enrollment_window_start || new Date().toISOString().split('T')[0]);

    const calUntilDate = isRolling ? calcRollingUntilDate(cls.enrollment_window_end) : null;
    const calWeeks = isRolling ? undefined : calcWeeksFromDates(cls.class_start_date, cls.class_end_date, SESSIONS_PER_SLOT);

    console.log(`[backfill-calendar] Processing: ${cls.name} (${cls.group_size_type}) start=${calStartDate} ${calUntilDate ? `until=${calUntilDate}` : `weeks=${calWeeks}`}`);

    try {
      // Day 1
      const summary1 = `${cls.name} — ${formatGroupSize(cls.group_size_type)} (${cls.meeting_day} ${cls.meeting_time})`;
      const event1 = await createClassCalendarBlock({
        summary: summary1,
        startDate: calStartDate,
        meetingDay: cls.meeting_day,
        meetingTime: cls.meeting_time,
        ...(calUntilDate ? { untilDate: calUntilDate } : { weeksCount: calWeeks }),
      });

      console.log(`[backfill-calendar] Created event for ${cls.name}: ${event1.id}`);

      const updateData: Record<string, string | null> = {};
      if (event1.id) updateData.google_calendar_event_id = event1.id;
      if (event1.meetLink && !cls.google_calendar_event_id_2) {
        updateData.google_meet_link = event1.meetLink;
      }

      // Day 2 (LG only, if missing)
      if (cls.meeting_day_2 && cls.meeting_time_2 && !cls.google_calendar_event_id_2) {
        const summary2 = `${cls.name} — ${formatGroupSize(cls.group_size_type)} (${cls.meeting_day_2} ${cls.meeting_time_2})`;
        const event2 = await createClassCalendarBlock({
          summary: summary2,
          startDate: calStartDate,
          meetingDay: cls.meeting_day_2,
          meetingTime: cls.meeting_time_2,
          weeksCount: calWeeks,
        });
        if (event2.id) updateData.google_calendar_event_id_2 = event2.id;
      }

      if (Object.keys(updateData).length > 0) {
        await adminClient.from('classes').update(updateData).eq('id', cls.id);
      }

      results.push({ id: cls.id, name: cls.name || 'unnamed', status: 'created' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[backfill-calendar] Failed for ${cls.name}:`, msg);
      results.push({ id: cls.id, name: cls.name || 'unnamed', status: `error: ${msg}` });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  console.log(`[backfill-calendar] Done. ${created}/${classes.length} created.`);
  return NextResponse.json({ message: `Backfilled ${created}/${classes.length} classes`, results });
}

/**
 * PUT /api/google/backfill-calendar
 * Re-syncs calendar events for ALL active classes: deletes old events, recreates.
 * SG/1:1 get UNTIL-based recurrence; LG get COUNT-based (both day 1 and day 2).
 * Admin-only endpoint.
 */
export async function PUT() {
  console.log(`[resync-calendar] Starting full resync...`);

  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error('[resync-calendar] Failed to create supabase client:', err);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }

  const adminClient = createAdminClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch ALL active classes
  const { data: classes, error } = await adminClient
    .from('classes')
    .select('id, name, subject, level, group_size_type, meeting_day, meeting_time, meeting_day_2, meeting_time_2, class_start_date, class_end_date, enrollment_window_start, enrollment_window_end, google_calendar_event_id, google_calendar_event_id_2')
    .eq('active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!classes || classes.length === 0) {
    return NextResponse.json({ message: 'No active classes found' });
  }

  console.log(`[resync-calendar] Processing ${classes.length} classes (3 at a time)...`);

  const BATCH_SIZE = 3;
  const results: { id: string; name: string; status: string }[] = [];

  for (let i = 0; i < classes.length; i += BATCH_SIZE) {
    const batch = classes.slice(i, i + BATCH_SIZE);
    console.log(`[resync-calendar] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map(c => c.name).join(', ')}`);

    const batchResults = await Promise.all(batch.map(async (cls) => {
      try {
        const isRolling = cls.group_size_type === 'small' || cls.group_size_type === 'one_on_one';

        // Delete old calendar events
        if (cls.google_calendar_event_id) {
          await deleteClassCalendarBlock(cls.google_calendar_event_id).catch(() => {});
        }
        if (cls.google_calendar_event_id_2) {
          await deleteClassCalendarBlock(cls.google_calendar_event_id_2).catch(() => {});
        }

        const calStartDate = isRolling
          ? (cls.enrollment_window_start || new Date().toISOString().split('T')[0])
          : (cls.class_start_date || cls.enrollment_window_start || new Date().toISOString().split('T')[0]);

        const calUntilDate = isRolling ? calcRollingUntilDate(cls.enrollment_window_end) : null;
        const calWeeks = isRolling ? undefined : calcWeeksFromDates(cls.class_start_date, cls.class_end_date, SESSIONS_PER_SLOT);

        // Day 1
        const summary1 = `${cls.name} — ${formatGroupSize(cls.group_size_type)} (${cls.meeting_day} ${cls.meeting_time})`;
        const event1 = await createClassCalendarBlock({
          summary: summary1,
          startDate: calStartDate,
          meetingDay: cls.meeting_day,
          meetingTime: cls.meeting_time,
          ...(calUntilDate ? { untilDate: calUntilDate } : { weeksCount: calWeeks }),
        });

        const updateData: Record<string, string | null> = {};
        updateData.google_calendar_event_id = event1.id ?? null;
        if (event1.meetLink) updateData.google_meet_link = event1.meetLink;

        // Day 2 (LG only)
        if (cls.meeting_day_2 && cls.meeting_time_2) {
          const summary2 = `${cls.name} — ${formatGroupSize(cls.group_size_type)} (${cls.meeting_day_2} ${cls.meeting_time_2})`;
          const event2 = await createClassCalendarBlock({
            summary: summary2,
            startDate: calStartDate,
            meetingDay: cls.meeting_day_2,
            meetingTime: cls.meeting_time_2,
            weeksCount: calWeeks,
          });
          if (event2.id) updateData.google_calendar_event_id_2 = event2.id;
        }

        await adminClient.from('classes').update(updateData).eq('id', cls.id);

        console.log(`[resync-calendar] OK ${cls.name}: ${event1.id}`);
        return { id: cls.id, name: cls.name || 'unnamed', status: 'resynced' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[resync-calendar] FAIL ${cls.name}: ${msg}`);
        return { id: cls.id, name: cls.name || 'unnamed', status: `error: ${msg}` };
      }
    }));

    results.push(...batchResults);

    // Wait 1.5s between batches to avoid rate limits
    if (i + BATCH_SIZE < classes.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const resynced = results.filter((r) => r.status === 'resynced').length;

  console.log(`[resync-calendar] Done. ${resynced}/${classes.length} resynced.`);
  return NextResponse.json({
    message: `Resynced ${resynced}/${classes.length} classes`,
    results,
  });
}
