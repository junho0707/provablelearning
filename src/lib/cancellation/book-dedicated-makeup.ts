'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function bookDedicatedMakeup(
  cancellationId: string,
  makeupSessionId: string
): Promise<{
  bookingId?: string;
  sessionDate?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const adminClient = createAdminClient();

  // Remove any previously cancelled makeup booking for this cancellation
  await adminClient
    .from('makeup_bookings')
    .delete()
    .eq('cancellation_id', cancellationId)
    .eq('status', 'cancelled');

  const { data, error } = await adminClient.rpc('book_dedicated_makeup', {
    p_cancellation_id: cancellationId,
    p_makeup_session_id: makeupSessionId,
    p_booked_by: user.id,
  });

  if (error) {
    const msg = error.message || 'Unknown error';
    if (msg.includes('not in cancelled status')) return { error: 'This cancellation has already been rescheduled or resolved.' };
    if (msg.includes('only for small/medium')) return { error: 'Dedicated makeup sessions are only for small/medium groups.' };
    if (msg.includes('subject/level does not match')) return { error: 'This makeup session does not match your course.' };
    if (msg.includes('session is full') || msg.includes('Makeup session is full')) return { error: 'This session is full. Please try another.' };
    if (msg.includes('past or current-day')) return { error: 'Cannot book a past makeup session.' };
    if (msg.includes('after the credit deadline')) return { error: 'This session is after your credit deadline.' };
    if (msg.includes('Not authorized')) return { error: 'You are not authorized to book this makeup.' };
    return { error: msg };
  }

  // Fetch the booking to get the session date
  const { data: booking } = await adminClient
    .from('makeup_bookings')
    .select('session_date, makeup_session_id')
    .eq('id', data)
    .single();

  // Mark any matching makeup_waitlist entries as 'booked'
  await adminClient
    .from('makeup_waitlist')
    .update({ status: 'booked' })
    .eq('cancellation_id', cancellationId)
    .in('status', ['waiting', 'notified']);

  // Fetch makeup session for notification details
  let sessionTime = '';
  if (booking?.makeup_session_id) {
    const { data: ms } = await adminClient
      .from('makeup_sessions')
      .select('session_time')
      .eq('id', booking.makeup_session_id)
      .single();
    sessionTime = ms?.session_time || '';
  }

  // Insert parent notification
  try {
    const { data: cancellation } = await adminClient
      .from('session_cancellations')
      .select('student_id')
      .eq('id', cancellationId)
      .single();

    if (cancellation) {
      const { data: studentRow } = await adminClient
        .from('students')
        .select('parent_id, users!students_user_id_fkey(full_name)')
        .eq('id', cancellation.student_id)
        .single();

      if (studentRow) {
        const parentId = (studentRow as Record<string, unknown>).parent_id as string;
        const userObj = (studentRow as Record<string, unknown>).users as unknown as
          | Record<string, string>
          | Record<string, string>[];
        const studentName = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;

        const dateStr = booking?.session_date
          ? new Date(booking.session_date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
          : '';

        await adminClient.from('notifications').insert({
          user_id: parentId,
          message: `Makeup booked for ${studentName || 'your child'}${dateStr ? ` — ${dateStr}` : ''}${sessionTime ? ` at ${sessionTime}` : ''}`,
          type: 'makeup',
        });
      }
    }
  } catch {
    // Non-critical
  }

  return {
    bookingId: data as string,
    sessionDate: booking?.session_date || undefined,
  };
}
