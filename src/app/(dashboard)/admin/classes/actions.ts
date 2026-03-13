'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClassSchema, updateClassSchema } from '@/lib/validators/class';
import { createClassCalendarBlock, deleteClassCalendarBlock } from '@/lib/google/calendar';
import { createClassroomCourse, deleteClassroomCourse } from '@/lib/google/classroom';
import { SESSIONS_PER_SLOT } from '@/lib/constants';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/** Timeout wrapper — rejects if a promise doesn't resolve within `ms` */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/** Calculate number of weeks a class spans from start to end date */
function calcWeeksFromDates(startDate: string | null, endDate: string | null, fallback: number): number {
  if (!startDate || !endDate) return fallback;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks);
}

/**
 * For SG/1:1 rolling enrollment: calendar slots recur until
 * enrollment_window_end + 4 weeks (Saturday end of that week).
 * Returns a YYYY-MM-DD string for the UNTIL date.
 */
function calcRollingUntilDate(enrollmentWindowEnd: string | null): string | null {
  if (!enrollmentWindowEnd) return null;
  const end = new Date(enrollmentWindowEnd);
  // Latest student starts on window end → needs 4 full weeks (28 days) to fit all sessions
  end.setDate(end.getDate() + 28);
  return end.toISOString().split('T')[0];
}

function formatGroupSize(type: string): string {
  const labels: Record<string, string> = {
    one_on_one: '1-on-1',
    small: 'Small',
    large: 'Large',
  };
  return labels[type] ?? type;
}

export async function createClass(formData: FormData) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify caller is admin (use adminClient to bypass RLS)
  const { data: profile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return { error: 'Forbidden' };

  // Normalize time values: strip seconds (e.g. "15:00:00" → "15:00")
  const normalizeTime = (t: string | null) => t ? t.slice(0, 5) : t;

  const groupSizeType = formData.get('group_size_type') as string;
  const isSgOrOneOnOne = groupSizeType === 'small' || groupSizeType === 'one_on_one';

  const parsed = createClassSchema.safeParse({
    name: formData.get('name'),
    subject: isSgOrOneOnOne ? null : formData.get('subject'),
    level: isSgOrOneOnOne ? null : formData.get('level'),
    group_size_type: groupSizeType,
    capacity: Number(formData.get('capacity')),
    meeting_day: formData.get('meeting_day'),
    meeting_time: normalizeTime(formData.get('meeting_time') as string | null),
    meeting_day_2: formData.get('meeting_day_2') || null,
    meeting_time_2: normalizeTime(formData.get('meeting_time_2') as string | null) || null,
    class_start_date: formData.get('class_start_date') || null,
    class_end_date: formData.get('class_end_date') || null,
    enrollment_window_start: formData.get('enrollment_window_start') || null,
    enrollment_window_end: formData.get('enrollment_window_end') || null,
    google_meet_link: formData.get('google_meet_link') || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { error, data: cls } = await adminClient
    .from('classes')
    .insert(parsed.data)
    .select('id')
    .single();

  if (error) return { error: error.message };

  // Create Google Calendar blocks for all class types
  // LG: fixed start/end dates with COUNT; SG/1:1: rolling slots with UNTIL date
  {
    const isRolling = parsed.data.group_size_type === 'small' || parsed.data.group_size_type === 'one_on_one';

    const calStartDate = isRolling
      ? (parsed.data.enrollment_window_start || new Date().toISOString().split('T')[0])
      : (parsed.data.class_start_date || parsed.data.enrollment_window_start || new Date().toISOString().split('T')[0]);

    // SG/1:1: recur until enrollment_window_end + 4 weeks (Saturday)
    // LG: fixed count from class dates
    const calUntilDate = isRolling
      ? calcRollingUntilDate(parsed.data.enrollment_window_end as string | null)
      : null;
    const calWeeks = isRolling
      ? undefined
      : calcWeeksFromDates(parsed.data.class_start_date ?? null, parsed.data.class_end_date ?? null, SESSIONS_PER_SLOT);

    try {
      // Calendar block for day 1
      const summary1 = `${parsed.data.name} — ${formatGroupSize(parsed.data.group_size_type)} (${parsed.data.meeting_day} ${parsed.data.meeting_time})`;
      const event1 = await withTimeout(createClassCalendarBlock({
        summary: summary1,
        startDate: calStartDate,
        meetingDay: parsed.data.meeting_day,
        meetingTime: parsed.data.meeting_time,
        groupSizeType: parsed.data.group_size_type,
        ...(calUntilDate ? { untilDate: calUntilDate } : { weeksCount: calWeeks }),
      }), 15000);

      const updateData: Record<string, string | null> = {};
      if (event1.id) updateData.google_calendar_event_id = event1.id;
      if (event1.meetLink) updateData.google_meet_link = event1.meetLink;

      // Calendar block for day 2 (LG only)
      if (parsed.data.meeting_day_2 && parsed.data.meeting_time_2) {
        const summary2 = `${parsed.data.name} — ${formatGroupSize(parsed.data.group_size_type)} (${parsed.data.meeting_day_2} ${parsed.data.meeting_time_2})`;
        const event2 = await withTimeout(createClassCalendarBlock({
          summary: summary2,
          startDate: calStartDate,
          meetingDay: parsed.data.meeting_day_2,
          meetingTime: parsed.data.meeting_time_2,
          groupSizeType: parsed.data.group_size_type,
          weeksCount: calWeeks,
        }), 15000);
        if (event2.id) updateData.google_calendar_event_id_2 = event2.id;
      }

      if (Object.keys(updateData).length > 0) {
        await adminClient.from('classes').update(updateData).eq('id', cls.id);
      }
    } catch (err) {
      console.error('Failed to create calendar block for class:', err instanceof Error ? err.message : err);
      console.error('Full calendar error:', JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2));
    }
  }

  // Create Google Classroom course:
  // LG: 1 per class
  // SG/1:1: per-student at enrollment time (skip here)
  if (parsed.data.group_size_type === 'large') {
    try {
      const section = `${formatGroupSize(parsed.data.group_size_type)} — ${parsed.data.meeting_day} ${parsed.data.meeting_time}`;
      const classroomResult = await createClassroomCourse({
        name: parsed.data.name,
        section,
      });

      if (classroomResult?.courseId) {
        await adminClient
          .from('classes')
          .update({
            google_classroom_id: classroomResult.courseId,
            google_classroom_enrollment_code: classroomResult.enrollmentCode || null,
            google_classroom_link: classroomResult.alternateLink || null,
          })
          .eq('id', cls.id);
      }
    } catch (err) {
      console.error('Failed to create Google Classroom for class:', err);
    }
  }

  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}

export async function createBatchSlots(input: {
  name: string;
  group_size_type: 'small' | 'one_on_one';
  capacity: number;
  slots: Array<{ day: string; time: string }>;
  enrollment_window_start: string | null;
  enrollment_window_end: string | null;
}) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify caller is admin (use adminClient to bypass RLS)
  const { data: profile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return { error: 'Forbidden' };

  if (!input.slots.length) return { error: 'At least one time slot is required' };

  // Validate each slot's time format (must be HH:MM)
  for (const slot of input.slots) {
    if (!/^\d{2}:\d{2}$/.test(slot.time)) {
      return { error: `Invalid time format for ${slot.day}: ${slot.time}` };
    }
  }

  // Validate capacity against group size range
  const ranges: Record<string, { min: number; max: number }> = {
    small: { min: 2, max: 4 },
    one_on_one: { min: 1, max: 1 },
  };
  const { min, max } = ranges[input.group_size_type];
  if (input.capacity < min || input.capacity > max) {
    return { error: `${input.group_size_type === 'small' ? 'Small group' : '1:1'} capacity must be ${min === max ? min : `${min}-${max}`}` };
  }

  // Build rows to insert — one class per slot (SG/1:1 are subject-agnostic)
  const rows = input.slots.map((slot) => ({
    name: input.name,
    subject: null,
    level: null,
    group_size_type: input.group_size_type,
    capacity: input.capacity,
    meeting_day: slot.day,
    meeting_time: slot.time,
    enrollment_window_start: input.enrollment_window_start,
    enrollment_window_end: input.enrollment_window_end,
  }));

  const { error, data: created } = await adminClient
    .from('classes')
    .insert(rows)
    .select('id');

  if (error) return { error: error.message };

  // Create Google Calendar blocks for each slot (SG/1:1 = rolling with UNTIL date)
  if (created && created.length > 0) {
    const calStartDate = input.enrollment_window_start || new Date().toISOString().split('T')[0];
    const calUntilDate = calcRollingUntilDate(input.enrollment_window_end);
    for (let i = 0; i < created.length; i++) {
      try {
        const slot = input.slots[i];
        const summary = `${input.name} — ${formatGroupSize(input.group_size_type)} (${slot.day} ${slot.time})`;
        const event = await createClassCalendarBlock({
          summary,
          startDate: calStartDate,
          meetingDay: slot.day,
          meetingTime: slot.time,
          groupSizeType: input.group_size_type,
          ...(calUntilDate ? { untilDate: calUntilDate } : { weeksCount: SESSIONS_PER_SLOT }),
        });

        const updateData: Record<string, string | null> = {};
        if (event.id) updateData.google_calendar_event_id = event.id;
        if (event.meetLink) updateData.google_meet_link = event.meetLink;

        if (Object.keys(updateData).length > 0) {
          await adminClient.from('classes').update(updateData).eq('id', created[i].id);
        }
      } catch (err) {
        console.error(`Failed to create calendar block for slot ${input.slots[i].day} ${input.slots[i].time}:`, err);
      }
    }
  }

  // Google Classroom: SG/1:1 = per-student at enrollment time (skip here)

  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}

export async function updateClass(formData: FormData) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify caller is admin (use adminClient to bypass RLS)
  const { data: profile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return { error: 'Forbidden' };

  // Normalize time values: strip seconds (e.g. "15:00:00" → "15:00")
  const rawTime = formData.get('meeting_time') as string | null;
  const rawTime2 = formData.get('meeting_time_2') as string | null;
  const normalizeTime = (t: string | null) => t ? t.slice(0, 5) : t;

  const updateGroupSize = (formData.get('group_size_type') as string) || undefined;
  const isUpdateSgOrOneOnOne = updateGroupSize === 'small' || updateGroupSize === 'one_on_one';

  const parsed = updateClassSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name') || undefined,
    subject: isUpdateSgOrOneOnOne ? null : (formData.get('subject') || undefined),
    level: isUpdateSgOrOneOnOne ? null : (formData.get('level') || undefined),
    group_size_type: updateGroupSize,
    capacity: formData.get('capacity') ? Number(formData.get('capacity')) : undefined,
    meeting_day: formData.get('meeting_day') || undefined,
    meeting_time: normalizeTime(rawTime) || undefined,
    meeting_day_2: formData.has('meeting_day_2') ? (formData.get('meeting_day_2') || null) : undefined,
    meeting_time_2: formData.has('meeting_time_2') ? (normalizeTime(rawTime2) || null) : undefined,
    class_start_date: formData.get('class_start_date') || undefined,
    class_end_date: formData.get('class_end_date') || undefined,
    enrollment_window_start: formData.has('enrollment_window_start') ? (formData.get('enrollment_window_start') || null) : undefined,
    enrollment_window_end: formData.has('enrollment_window_end') ? (formData.get('enrollment_window_end') || null) : undefined,
    google_meet_link: formData.get('google_meet_link') || undefined,
    google_classroom_id: formData.get('google_classroom_id') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, ...updates } = parsed.data;

  // If reducing capacity, check active enrollment count
  if (updates.capacity !== undefined) {
    const adminClient = createAdminClient();
    const { count } = await adminClient
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .or(`slot_1_class_id.eq.${id},slot_2_class_id.eq.${id},slot_3_class_id.eq.${id},class_id.eq.${id}`)
      .in('status', ['active']);

    if (count && updates.capacity < count) {
      return { error: `Cannot reduce capacity below active enrollment count (${count}).` };
    }
  }

  const { error } = await adminClient.from('classes').update(updates).eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}

export async function syncMeetLink(classId: string): Promise<{ error?: string; meetLink?: string }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await adminClient.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: 'Forbidden' };

  const { data: cls } = await adminClient.from('classes').select('google_calendar_event_id, google_meet_link').eq('id', classId).single();
  if (!cls) return { error: 'Class not found' };
  if (!cls.google_calendar_event_id) return { error: 'No calendar event linked to this class' };

  try {
    const { google } = await import('googleapis');
    const { getAuthedClient } = await import('@/lib/google/auth');
    const auth = await getAuthedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const event = await calendar.events.get({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      eventId: cls.google_calendar_event_id,
    });

    const meetLink = event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video',
    )?.uri ?? null;

    if (!meetLink) return { error: 'Calendar event has no Meet link' };

    await adminClient.from('classes').update({ google_meet_link: meetLink }).eq('id', classId);
    revalidatePath(`/admin/classes/${classId}`);

    return { meetLink };
  } catch (err) {
    return { error: `Failed to fetch calendar event: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

export async function deleteClass(classId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify caller is admin (use adminClient to bypass RLS)
  const { data: profile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return { error: 'Forbidden' };

  // Check for any enrollments
  const { count: enrollmentCount } = await adminClient
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .or(`slot_1_class_id.eq.${classId},slot_2_class_id.eq.${classId},slot_3_class_id.eq.${classId},class_id.eq.${classId}`);

  if (enrollmentCount && enrollmentCount > 0) {
    return { error: `Cannot delete: ${enrollmentCount} enrollment(s) exist. Refund/drop all enrollments first.` };
  }

  // Check for cancellations
  const { count: cancellationCount } = await adminClient
    .from('session_cancellations')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', classId);

  if (cancellationCount && cancellationCount > 0) {
    return { error: `Cannot delete: ${cancellationCount} cancellation(s) exist.` };
  }

  // Check for makeup bookings (as host)
  const { count: makeupCount } = await adminClient
    .from('makeup_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('host_class_id', classId);

  if (makeupCount && makeupCount > 0) {
    return { error: `Cannot delete: ${makeupCount} makeup booking(s) reference this class.` };
  }

  // Clean up waitlist_notify_queue
  await adminClient.from('waitlist_notify_queue').delete().eq('class_id', classId);

  // Clean up makeup_waitlist
  await adminClient.from('makeup_waitlist').delete().eq('host_class_id', classId);

  // Delete Google Calendar events + Classroom course
  const { data: cls } = await supabase
    .from('classes')
    .select('google_calendar_event_id, google_calendar_event_id_2, google_classroom_id')
    .eq('id', classId)
    .single();

  if (cls?.google_calendar_event_id) {
    try {
      await deleteClassCalendarBlock(cls.google_calendar_event_id);
    } catch (err) {
      console.error('Failed to delete calendar event 1:', err);
    }
  }

  if (cls?.google_calendar_event_id_2) {
    try {
      await deleteClassCalendarBlock(cls.google_calendar_event_id_2);
    } catch (err) {
      console.error('Failed to delete calendar event 2:', err);
    }
  }

  if (cls?.google_classroom_id) {
    try {
      await deleteClassroomCourse(cls.google_classroom_id);
    } catch (err) {
      console.error('Failed to delete Google Classroom:', err);
    }
  }

  const { error } = await adminClient.from('classes').delete().eq('id', classId);

  if (error) return { error: error.message };

  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}
