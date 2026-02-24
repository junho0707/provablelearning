'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { computeSessionDates } from '@/lib/scheduling/session-dates';

export interface AlternateSession {
  classId: string;
  meetingDay: string;
  meetingTime: string;
  sessionDate: string;
  availableSeats: number;
  isFull: boolean;
  sessionNumber: number;
  googleMeetLink: string | null;
}

export async function findAlternateSessions(
  cancellationId: string
): Promise<{
  sessions?: AlternateSession[];
  error?: string;
}> {
  const adminClient = createAdminClient();

  // Fetch the cancellation
  const { data: cancellation, error: cancelError } = await adminClient
    .from('session_cancellations')
    .select('id, course_id, class_id, session_number, session_date, group_size_type, status')
    .eq('id', cancellationId)
    .single();

  if (cancelError || !cancellation) {
    return { error: 'Cancellation not found' };
  }

  if (cancellation.status !== 'cancelled') {
    return { error: 'Cancellation is not in cancelled status' };
  }

  if (cancellation.group_size_type === 'one_on_one') {
    return { error: 'Alternate sessions not available for 1:1' };
  }

  // Find classes with same course_id and group_size_type, excluding the original
  const { data: classes } = await adminClient
    .from('classes')
    .select('id, course_id, group_size_type, capacity, meeting_day, meeting_time, google_meet_link, active')
    .eq('course_id', cancellation.course_id)
    .eq('group_size_type', cancellation.group_size_type)
    .eq('active', true)
    .neq('id', cancellation.class_id);

  if (!classes || classes.length === 0) {
    return { sessions: [] };
  }

  // Get the course start_date for session date computation
  const { data: course } = await adminClient
    .from('courses')
    .select('start_date')
    .eq('id', cancellation.course_id)
    .single();

  if (!course) {
    return { error: 'Course not found' };
  }

  // Compute the original session's week start (Sunday-based)
  const origDate = new Date(cancellation.session_date + 'T00:00:00');
  const origWeekStart = new Date(origDate);
  origWeekStart.setDate(origWeekStart.getDate() - origDate.getDay());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alternateSessions: AlternateSession[] = [];

  for (const cls of classes) {
    // Compute this class's session date for the same session number
    const sessions = computeSessionDates(course.start_date, cls.meeting_day);
    const targetSession = sessions.find(
      (s) => s.sessionNumber === cancellation.session_number
    );

    if (!targetSession) continue;

    // Check same week
    const hostDate = targetSession.date;
    const hostWeekStart = new Date(hostDate);
    hostWeekStart.setDate(hostWeekStart.getDate() - hostDate.getDay());

    if (origWeekStart.getTime() !== hostWeekStart.getTime()) continue;

    // Must be in the future
    if (hostDate <= today) continue;

    // Count active enrollments
    const { count: activeCount } = await adminClient
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', cls.id)
      .eq('status', 'active');

    // Count booked makeups for this session
    const { count: makeupCount } = await adminClient
      .from('makeup_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('host_class_id', cls.id)
      .eq('session_number', cancellation.session_number)
      .eq('status', 'booked');

    const totalOccupied = (activeCount || 0) + (makeupCount || 0);
    const available = Math.max(0, cls.capacity - totalOccupied);

    alternateSessions.push({
      classId: cls.id,
      meetingDay: cls.meeting_day,
      meetingTime: cls.meeting_time,
      sessionDate: targetSession.dateStr,
      availableSeats: available,
      isFull: available <= 0,
      sessionNumber: cancellation.session_number,
      googleMeetLink: cls.google_meet_link,
    });
  }

  return { sessions: alternateSessions };
}
