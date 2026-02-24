'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClassSchema, updateClassSchema } from '@/lib/validators/class';
import { createClassCalendarBlock, deleteClassCalendarBlock } from '@/lib/google/calendar';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

async function getCourseDates(supabase: Awaited<ReturnType<typeof createClient>>, courseId: string) {
  const { data } = await supabase
    .from('courses')
    .select('name, start_date, end_date')
    .eq('id', courseId)
    .single();
  return data;
}

function calcWeeks(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

function formatGroupSize(type: string): string {
  const labels: Record<string, string> = {
    one_on_one: '1-on-1',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
  };
  return labels[type] ?? type;
}

export async function createClass(formData: FormData) {
  const supabase = await createClient();

  const parsed = createClassSchema.safeParse({
    course_id: formData.get('course_id'),
    group_size_type: formData.get('group_size_type'),
    capacity: Number(formData.get('capacity')),
    meeting_day: formData.get('meeting_day'),
    meeting_time: formData.get('meeting_time'),
    google_meet_link: formData.get('google_meet_link') || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { error, data: cls } = await supabase
    .from('classes')
    .insert(parsed.data)
    .select('id')
    .single();

  if (error) return { error: error.message };

  // Create calendar block (non-blocking — don't fail class creation)
  try {
    const course = await getCourseDates(supabase, parsed.data.course_id);
    if (course) {
      const weeksCount = calcWeeks(course.start_date, course.end_date);
      const summary = `${course.name} — ${formatGroupSize(parsed.data.group_size_type)} (${parsed.data.meeting_day} ${parsed.data.meeting_time})`;

      const event = await createClassCalendarBlock({
        summary,
        startDate: course.start_date,
        meetingDay: parsed.data.meeting_day,
        meetingTime: parsed.data.meeting_time,
        weeksCount,
        meetLink: parsed.data.google_meet_link,
      });

      if (event.id) {
        await supabase
          .from('classes')
          .update({ google_calendar_event_id: event.id })
          .eq('id', cls.id);
      }
    }
  } catch (err) {
    console.error('Failed to create calendar block for class:', err);
  }

  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}

export async function updateClass(formData: FormData) {
  const supabase = await createClient();

  const parsed = updateClassSchema.safeParse({
    id: formData.get('id'),
    course_id: formData.get('course_id') || undefined,
    group_size_type: formData.get('group_size_type') || undefined,
    capacity: formData.get('capacity') ? Number(formData.get('capacity')) : undefined,
    meeting_day: formData.get('meeting_day') || undefined,
    meeting_time: formData.get('meeting_time') || undefined,
    google_meet_link: formData.get('google_meet_link') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, ...updates } = parsed.data;

  // If reducing capacity, check active enrollment count
  if (updates.capacity !== undefined) {
    const { count } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', id)
      .in('status', ['active']);

    if (count && updates.capacity < count) {
      return { error: `Cannot reduce capacity below active enrollment count (${count}).` };
    }
  }

  // Check if schedule changed — need to recreate calendar event
  const scheduleChanged = updates.meeting_day !== undefined || updates.meeting_time !== undefined;

  // Fetch existing class data if schedule changed (need old event ID + course info)
  let oldEventId: string | null = null;
  let courseId: string | undefined = updates.course_id;

  if (scheduleChanged) {
    const { data: existing } = await supabase
      .from('classes')
      .select('google_calendar_event_id, course_id, meeting_day, meeting_time, group_size_type, google_meet_link')
      .eq('id', id)
      .single();

    if (existing) {
      oldEventId = existing.google_calendar_event_id;
      courseId = courseId ?? existing.course_id;
    }
  }

  const { error } = await supabase.from('classes').update(updates).eq('id', id);

  if (error) return { error: error.message };

  // Recreate calendar event if schedule changed
  if (scheduleChanged && courseId) {
    try {
      // Delete old event
      if (oldEventId) {
        await deleteClassCalendarBlock(oldEventId).catch((err: unknown) => {
          console.error('Failed to delete old calendar event:', err);
        });
      }

      // Fetch updated class + course for new event
      const { data: updatedClass } = await supabase
        .from('classes')
        .select('meeting_day, meeting_time, group_size_type, google_meet_link')
        .eq('id', id)
        .single();

      const course = await getCourseDates(supabase, courseId);

      if (updatedClass && course) {
        const weeksCount = calcWeeks(course.start_date, course.end_date);
        const summary = `${course.name} — ${formatGroupSize(updatedClass.group_size_type)} (${updatedClass.meeting_day} ${updatedClass.meeting_time})`;

        const event = await createClassCalendarBlock({
          summary,
          startDate: course.start_date,
          meetingDay: updatedClass.meeting_day,
          meetingTime: updatedClass.meeting_time,
          weeksCount,
          meetLink: updatedClass.google_meet_link,
        });

        if (event.id) {
          await supabase
            .from('classes')
            .update({ google_calendar_event_id: event.id })
            .eq('id', id);
        }
      }
    } catch (err) {
      console.error('Failed to recreate calendar block for class:', err);
    }
  }

  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}

export async function deleteClass(classId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Check for any enrollments (any status)
  const { count: enrollmentCount } = await adminClient
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', classId);

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
  await adminClient
    .from('waitlist_notify_queue')
    .delete()
    .eq('class_id', classId);

  // Clean up makeup_waitlist
  await adminClient
    .from('makeup_waitlist')
    .delete()
    .eq('host_class_id', classId);

  // Delete Google Calendar event if exists
  const { data: cls } = await supabase
    .from('classes')
    .select('google_calendar_event_id')
    .eq('id', classId)
    .single();

  if (cls?.google_calendar_event_id) {
    try {
      await deleteClassCalendarBlock(cls.google_calendar_event_id);
    } catch (err) {
      console.error('Failed to delete calendar event:', err);
    }
  }

  // Delete the class (waitlist entries cascade automatically)
  const { error } = await adminClient
    .from('classes')
    .delete()
    .eq('id', classId);

  if (error) return { error: error.message };

  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}
