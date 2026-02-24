'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export interface DedicatedMakeupSession {
  id: string;
  sessionDate: string;
  sessionTime: string;
  capacity: number;
  bookedCount: number;
  availableSeats: number;
  isFull: boolean;
  googleMeetLink: string | null;
  location: string | null;
}

export async function findDedicatedMakeupSessions(
  cancellationId: string
): Promise<{
  sessions?: DedicatedMakeupSession[];
  error?: string;
}> {
  const adminClient = createAdminClient();

  // Fetch the cancellation
  const { data: cancellation, error: cancelError } = await adminClient
    .from('session_cancellations')
    .select('id, course_id, status, group_size_type, credit_deadline')
    .eq('id', cancellationId)
    .single();

  if (cancelError || !cancellation) {
    return { error: 'Cancellation not found' };
  }

  if (cancellation.status !== 'cancelled') {
    return { error: 'Cancellation is not in cancelled status' };
  }

  if (!['small', 'medium'].includes(cancellation.group_size_type)) {
    return { error: 'Dedicated makeup sessions are only for small/medium groups' };
  }

  // Get course subject+level
  const { data: course } = await adminClient
    .from('courses')
    .select('subject, level')
    .eq('id', cancellation.course_id)
    .single();

  if (!course) {
    return { error: 'Course not found' };
  }

  // Find active makeup sessions matching subject+level, future, before credit deadline
  const today = new Date().toISOString().split('T')[0];

  let query = adminClient
    .from('makeup_sessions')
    .select('id, session_date, session_time, capacity, google_meet_link, location')
    .eq('subject', course.subject)
    .eq('level', course.level)
    .eq('group_size_type', cancellation.group_size_type)
    .eq('active', true)
    .gt('session_date', today)
    .order('session_date', { ascending: true });

  if (cancellation.credit_deadline) {
    // Filter to sessions before the credit deadline date
    const deadlineDate = new Date(cancellation.credit_deadline).toISOString().split('T')[0];
    query = query.lte('session_date', deadlineDate);
  }

  const { data: makeupSessions } = await query;

  if (!makeupSessions || makeupSessions.length === 0) {
    return { sessions: [] };
  }

  // Count booked bookings for each session
  const sessionIds = makeupSessions.map((s) => s.id);
  const { data: bookings } = await adminClient
    .from('makeup_bookings')
    .select('makeup_session_id')
    .in('makeup_session_id', sessionIds)
    .eq('status', 'booked');

  const bookedCountMap: Record<string, number> = {};
  for (const b of bookings || []) {
    const msId = b.makeup_session_id as string;
    bookedCountMap[msId] = (bookedCountMap[msId] || 0) + 1;
  }

  const sessions: DedicatedMakeupSession[] = makeupSessions.map((s) => {
    const booked = bookedCountMap[s.id] || 0;
    const available = Math.max(0, s.capacity - booked);
    return {
      id: s.id,
      sessionDate: s.session_date,
      sessionTime: s.session_time,
      capacity: s.capacity,
      bookedCount: booked,
      availableSeats: available,
      isFull: available <= 0,
      googleMeetLink: s.google_meet_link,
      location: s.location,
    };
  });

  return { sessions };
}
