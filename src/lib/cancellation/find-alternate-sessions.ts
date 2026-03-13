'use server';

import { createAdminClient } from '@/lib/supabase/admin';

const DAY_MAP: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

export interface AlternateSession {
  classId: string;
  meetingDay: string;
  meetingTime: string;
  sessionDate: string;
  availableSeats: number;
  isFull: boolean;
  isPast: boolean;
  sessionNumber: number;
  googleMeetLink: string | null;
}

export interface AlternateSessionsResult {
  sessions?: AlternateSession[];
  weekStart?: string;
  weekEnd?: string;
  windowStart?: string;
  windowEnd?: string;
  error?: string;
}

export async function findAlternateSessions(
  cancellationId: string,
  weekOffset: number = 0
): Promise<AlternateSessionsResult> {
  const adminClient = createAdminClient();

  // Fetch the cancellation
  const { data: cancellation, error: cancelError } = await adminClient
    .from('session_cancellations')
    .select('id, class_id, enrollment_id, session_number, session_date, group_size_type, status')
    .eq('id', cancellationId)
    .single();

  if (cancelError || !cancellation) {
    return { error: 'Cancellation not found' };
  }

  if (cancellation.status !== 'cancelled') {
    return { error: 'Cancellation is not in cancelled status' };
  }

  // Block LG (no cancellation/makeup for large groups)
  if (cancellation.group_size_type === 'large') {
    return { sessions: [] };
  }

  // Get original class to know group_size_type
  const { data: origClass } = await adminClient
    .from('classes')
    .select('id, group_size_type, class_start_date')
    .eq('id', cancellation.class_id)
    .single();

  if (!origClass) {
    return { error: 'Original class not found' };
  }

  // Get enrollment for start/end dates + enrolled class IDs
  const { data: enrollment } = await adminClient
    .from('enrollments')
    .select('student_start_date, student_end_date, slot_1_class_id, slot_2_class_id, slot_3_class_id, class_id')
    .eq('id', cancellation.enrollment_id)
    .single();

  const windowStart = enrollment?.student_start_date || origClass.class_start_date;
  const windowEnd = enrollment?.student_end_date;

  if (!windowStart) {
    return { error: 'Cannot determine start date for session computation' };
  }

  // Find all classes with same group_size_type (subject-agnostic for SG/1:1)
  const { data: classes } = await adminClient
    .from('classes')
    .select('id, capacity, meeting_day, meeting_time, google_meet_link, active, class_start_date, class_end_date')
    .eq('group_size_type', origClass.group_size_type)
    .eq('active', true);

  const filteredClasses = classes || [];

  if (filteredClasses.length === 0) {
    return { sessions: [], windowStart, windowEnd: windowEnd || undefined };
  }

  // Compute the target week based on cancelled session date + weekOffset
  const origDate = new Date(cancellation.session_date + 'T00:00:00');
  const origWeekSunday = new Date(origDate);
  origWeekSunday.setDate(origWeekSunday.getDate() - origDate.getDay()); // Sunday of cancelled week

  // Shift by weekOffset weeks
  const targetWeekSunday = new Date(origWeekSunday);
  targetWeekSunday.setDate(targetWeekSunday.getDate() + weekOffset * 7);

  const targetWeekSaturday = new Date(targetWeekSunday);
  targetWeekSaturday.setDate(targetWeekSaturday.getDate() + 6);

  // Format week bounds
  const weekStartStr = targetWeekSunday.toISOString().split('T')[0];
  const weekEndStr = targetWeekSaturday.toISOString().split('T')[0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const enrolledClassIds = [
    enrollment?.slot_1_class_id,
    enrollment?.slot_2_class_id,
    enrollment?.slot_3_class_id,
    enrollment?.class_id,
  ].filter(Boolean);

  const alternateSessions: AlternateSession[] = [];

  for (const cls of filteredClasses) {
    const targetDow = DAY_MAP[cls.meeting_day];
    if (targetDow === undefined) continue;

    // Skip classes the student is enrolled in
    if (enrolledClassIds.includes(cls.id)) continue;

    // Find the session date for this class in the target week
    const sessionDate = new Date(targetWeekSunday);
    sessionDate.setDate(targetWeekSunday.getDate() + targetDow);

    const sessionDateStr = sessionDate.toISOString().split('T')[0];

    // Track if this date is in the past (will show as unavailable)
    const isPast = sessionDate <= today;

    // Must be within enrollment end
    if (windowEnd && sessionDateStr > windowEnd) continue;

    // If the class has an end date, skip if the session is past it
    if (cls.class_end_date && sessionDateStr > cls.class_end_date) continue;

    // Compute session number from the host class start date
    let sessionNumber = 1;
    if (cls.class_start_date) {
      const hostStart = new Date(cls.class_start_date + 'T00:00:00');
      const hostOffset = (targetDow - hostStart.getDay() + 7) % 7;
      const firstHostDate = new Date(hostStart);
      firstHostDate.setDate(hostStart.getDate() + hostOffset);

      // Skip if session date is before the host class's first session
      if (sessionDate < firstHostDate) continue;

      const weeksSinceStart = Math.round(
        (sessionDate.getTime() - firstHostDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      sessionNumber = weeksSinceStart + 1;
    }

    // Past dates are shown but marked unavailable (no need to query DB)
    if (isPast) {
      alternateSessions.push({
        classId: cls.id,
        meetingDay: cls.meeting_day,
        meetingTime: cls.meeting_time,
        sessionDate: sessionDateStr,
        availableSeats: 0,
        isFull: true,
        isPast: true,
        sessionNumber,
        googleMeetLink: cls.google_meet_link,
      });
      continue;
    }

    // Count active enrollments (check all slot columns)
    const { count: activeCount } = await adminClient
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .or(`slot_1_class_id.eq.${cls.id},slot_2_class_id.eq.${cls.id},slot_3_class_id.eq.${cls.id},class_id.eq.${cls.id}`)
      .eq('status', 'active');

    // Count booked makeups for this specific session date
    const { count: makeupCount } = await adminClient
      .from('makeup_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('host_class_id', cls.id)
      .eq('session_date', sessionDateStr)
      .eq('status', 'booked');

    const totalOccupied = (activeCount || 0) + (makeupCount || 0);
    const available = Math.max(0, cls.capacity - totalOccupied);

    alternateSessions.push({
      classId: cls.id,
      meetingDay: cls.meeting_day,
      meetingTime: cls.meeting_time,
      sessionDate: sessionDateStr,
      availableSeats: available,
      isFull: available <= 0,
      isPast: false,
      sessionNumber,
      googleMeetLink: cls.google_meet_link,
    });
  }

  // Sort by date, then by time
  alternateSessions.sort((a, b) =>
    a.sessionDate.localeCompare(b.sessionDate) || a.meetingTime.localeCompare(b.meetingTime)
  );

  return {
    sessions: alternateSessions,
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    windowStart,
    windowEnd: windowEnd || undefined,
  };
}
