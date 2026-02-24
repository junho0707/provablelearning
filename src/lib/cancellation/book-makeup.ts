'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function bookMakeupSession(
  cancellationId: string,
  hostClassId: string
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
  // (unique constraint uq_makeup_cancellation prevents re-insert otherwise)
  await adminClient
    .from('makeup_bookings')
    .delete()
    .eq('cancellation_id', cancellationId)
    .eq('status', 'cancelled');

  const { data, error } = await adminClient.rpc('book_makeup_session', {
    p_cancellation_id: cancellationId,
    p_host_class_id: hostClassId,
    p_booked_by: user.id,
  });

  if (error) {
    const msg = error.message || 'Unknown error';
    if (msg.includes('not in cancelled status')) return { error: 'This cancellation has already been rescheduled or resolved.' };
    if (msg.includes('not available for 1:1')) return { error: 'Makeup booking is not available for 1:1 sessions.' };
    if (msg.includes('same course')) return { error: 'The alternate class must be for the same course.' };
    if (msg.includes('same group size')) return { error: 'The alternate class must have the same group size.' };
    if (msg.includes('same class')) return { error: 'You cannot book a makeup in the same class.' };
    if (msg.includes('same week')) return { error: 'The alternate session must be in the same week.' };
    if (msg.includes('session is full')) return { error: 'This session is full. Please try another class.' };
    if (msg.includes('past or current-day')) return { error: 'Cannot book a makeup for a past session.' };
    if (msg.includes('Not authorized')) return { error: 'You are not authorized to book this makeup.' };
    return { error: msg };
  }

  // Fetch the booking to get the session date and host class time
  const { data: booking } = await adminClient
    .from('makeup_bookings')
    .select('session_date, host_class_id, classes!makeup_bookings_host_class_id_fkey(meeting_day, meeting_time)')
    .eq('id', data)
    .single();

  // Mark any matching makeup_waitlist entries for this cancellation as 'booked'
  await adminClient
    .from('makeup_waitlist')
    .update({ status: 'booked' })
    .eq('cancellation_id', cancellationId)
    .in('status', ['waiting', 'notified']);

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
        .select('parent_id, user_id, users!students_user_id_fkey(full_name)')
        .eq('id', cancellation.student_id)
        .single();

      if (studentRow) {
        const parentId = (studentRow as Record<string, unknown>).parent_id as string | null;
        const userId = (studentRow as Record<string, unknown>).user_id as string | null;
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
        const bookingCls = (booking as Record<string, unknown>)?.classes as unknown as
          | Record<string, string>
          | Record<string, string>[];
        const meetingTime = Array.isArray(bookingCls) ? bookingCls[0]?.meeting_time : bookingCls?.meeting_time;

        // Notify parent if exists, otherwise notify independent student directly
        const notifyUserId = parentId || userId;
        if (notifyUserId) {
          await adminClient.from('notifications').insert({
            user_id: notifyUserId,
            message: `Makeup booked for ${studentName || 'you'}${dateStr ? ` — ${dateStr}` : ''}${meetingTime ? ` at ${meetingTime}` : ''}`,
            type: 'makeup',
          });
        }
      }
    }
  } catch {
    // Non-critical — don't fail the booking if notification insert fails
  }

  return {
    bookingId: data as string,
    sessionDate: booking?.session_date || undefined,
  };
}
