'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { computeSessionDates } from '@/lib/scheduling/session-dates';
import type { GroupSizeType, Subject, CourseLevel } from '@/lib/types';

const DAY_MAP: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

export interface CreditMakeupSlot {
  classId: string;
  className: string | null;
  meetingDay: string;
  meetingTime: string;
  sessionDate: string; // YYYY-MM-DD
  availableSeats: number;
  isFull: boolean;
  googleMeetLink: string | null;
}

export async function findMakeupSessionsForCredit(
  studentId: string,
  groupSizeType: GroupSizeType,
  subject?: Subject | null,
  level?: CourseLevel | null
): Promise<{
  sessions?: CreditMakeupSlot[];
  error?: string;
}> {
  const adminClient = createAdminClient();

  // Verify student has a matching credit
  let creditQuery = adminClient
    .from('credits')
    .select('id')
    .eq('student_id', studentId)
    .eq('group_size_type', groupSizeType)
    .gt('remaining_amount', 0)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .limit(1);

  if (subject) creditQuery = creditQuery.eq('subject', subject);
  if (level) creditQuery = creditQuery.eq('level', level);

  const { data: credits } = await creditQuery;

  if (!credits || credits.length === 0) {
    return { error: 'No matching credit available' };
  }

  // Get student's enrollment for this subject/level/group_size to determine date window
  const { data: studentEnrollments } = await adminClient
    .from('enrollments')
    .select('class_id, slot_1_class_id, slot_2_class_id, slot_3_class_id, student_start_date, student_end_date')
    .eq('student_id', studentId)
    .eq('status', 'active');

  // Collect enrolled class IDs and find the matching enrollment's date window
  const enrolledClassIds = new Set<string>();
  let windowStart: string | null = null;
  let windowEnd: string | null = null;

  // We need to match enrollments by subject/level — fetch class info for enrolled classes
  const allClassIds = (studentEnrollments || []).flatMap((e) =>
    [e.class_id, e.slot_1_class_id, e.slot_2_class_id, e.slot_3_class_id].filter((id): id is string => !!id)
  );

  const enrolledClassMap: Record<string, { subject: string | null; level: string | null; group_size_type: string }> = {};
  if (allClassIds.length > 0) {
    const { data: classRows } = await adminClient
      .from('classes')
      .select('id, subject, level, group_size_type')
      .in('id', allClassIds);
    for (const row of classRows || []) {
      enrolledClassMap[row.id] = { subject: row.subject, level: row.level, group_size_type: row.group_size_type };
    }
  }

  for (const e of studentEnrollments || []) {
    const ids = [e.class_id, e.slot_1_class_id, e.slot_2_class_id].filter((id): id is string => !!id);
    for (const id of ids) {
      enrolledClassIds.add(id);
    }
    // Check if this enrollment matches the credit's group_size (and subject/level if set)
    const primaryId = e.slot_1_class_id || e.class_id;
    if (primaryId && enrolledClassMap[primaryId]) {
      const cls = enrolledClassMap[primaryId];
      const matchesGroupSize = cls.group_size_type === groupSizeType;
      const matchesSubject = !subject || !cls.subject || cls.subject === subject;
      const matchesLevel = !level || !cls.level || cls.level === level;
      if (matchesGroupSize && matchesSubject && matchesLevel) {
        windowStart = e.student_start_date;
        windowEnd = e.student_end_date;
      }
    }
  }

  // Get dates this student already has a booked makeup (any class)
  const { data: existingBookings } = await adminClient
    .from('makeup_bookings')
    .select('host_class_id, session_date')
    .eq('student_id', studentId)
    .eq('status', 'booked');

  const bookedKeys = new Set(
    (existingBookings || []).map((b) => `${b.host_class_id}:${b.session_date}`)
  );

  // Find active classes matching group_size_type (and subject+level if set)
  let classQuery = adminClient
    .from('classes')
    .select('id, name, meeting_day, meeting_time, capacity, google_meet_link, class_start_date, class_end_date')
    .eq('group_size_type', groupSizeType)
    .eq('active', true)
    .order('meeting_day', { ascending: true });

  if (subject) classQuery = classQuery.eq('subject', subject);
  if (level) classQuery = classQuery.eq('level', level);

  const { data: classes } = await classQuery;

  if (!classes || classes.length === 0) {
    return { sessions: [] };
  }

  // Filter out student's own enrolled classes
  const filteredClasses = classes.filter((cls) => !enrolledClassIds.has(cls.id));

  if (filteredClasses.length === 0) {
    return { sessions: [] };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const slots: CreditMakeupSlot[] = [];

  for (const cls of filteredClasses) {
    let futureSessions: { dateStr: string; date: Date }[];

    if (cls.class_start_date) {
      // Class has a fixed start: compute from it
      const sessions = computeSessionDates(cls.class_start_date, cls.meeting_day, 52);
      futureSessions = sessions.filter((s) => {
        if (s.date <= today) return false;
        if (cls.class_end_date && s.dateStr > cls.class_end_date) return false;
        return true;
      });
    } else {
      // Rolling class: compute sessions within the student's enrollment window
      const targetDow = DAY_MAP[cls.meeting_day];
      if (targetDow === undefined) continue;

      const startDate = windowStart ? new Date(windowStart + 'T00:00:00') : today;
      const effectiveStart = startDate > today ? startDate : today;

      // Find first occurrence of meeting day on or after effectiveStart
      const diff = (targetDow - effectiveStart.getDay() + 7) % 7;
      const firstDate = new Date(effectiveStart);
      // If effectiveStart IS the meeting day and it's in the future, include it
      if (diff === 0 && effectiveStart > today) {
        // firstDate is already correct
      } else {
        firstDate.setDate(effectiveStart.getDate() + (diff === 0 ? 7 : diff));
      }

      futureSessions = [];
      for (let w = 0; w < 52; w++) {
        const d = new Date(firstDate);
        d.setDate(firstDate.getDate() + w * 7);
        const dateStr = d.toISOString().split('T')[0];
        // Stop if past end of enrollment window
        if (windowEnd && dateStr > windowEnd) break;
        // Also cap at 8 weeks if no window end
        if (!windowEnd && w >= 8) break;
        futureSessions.push({ date: d, dateStr });
      }
    }

    if (futureSessions.length === 0) continue;

    // Count enrolled students for capacity check
    const { count: enrolledCount } = await adminClient
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .or(`slot_1_class_id.eq.${cls.id},slot_2_class_id.eq.${cls.id},slot_3_class_id.eq.${cls.id},class_id.eq.${cls.id}`)
      .in('status', ['pending', 'active']);

    const enrolled = enrolledCount || 0;
    const available = Math.max(0, cls.capacity - enrolled);

    for (const session of futureSessions) {
      // Skip dates where student already has a booked makeup
      if (bookedKeys.has(`${cls.id}:${session.dateStr}`)) continue;

      slots.push({
        classId: cls.id,
        className: cls.name,
        meetingDay: cls.meeting_day,
        meetingTime: cls.meeting_time,
        sessionDate: session.dateStr,
        availableSeats: available,
        isFull: available <= 0,
        googleMeetLink: cls.google_meet_link,
      });
    }
  }

  // Sort by date
  slots.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  return { sessions: slots };
}
