'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoBookMakeupFromWaitlist } from '@/lib/cancellation/auto-book-makeup';
import { autoBookDedicatedMakeupFromWaitlist } from '@/lib/cancellation/auto-book-dedicated-makeup';

export async function cancelMakeupBooking(
  bookingId: string
): Promise<{
  success?: boolean;
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

  // Fetch booking details before cancellation (for waitlist notification)
  const { data: booking } = await adminClient
    .from('makeup_bookings')
    .select('host_class_id, session_number, makeup_session_id')
    .eq('id', bookingId)
    .single();

  const { error } = await adminClient.rpc('cancel_makeup_booking', {
    p_booking_id: bookingId,
    p_cancelled_by: user.id,
  });

  if (error) {
    const msg = error.message || 'Unknown error';
    if (msg.includes('not in booked status')) return { error: 'This makeup booking has already been cancelled or completed.' };
    if (msg.includes('Not authorized')) return { error: 'You are not authorized to cancel this makeup booking.' };
    return { error: msg };
  }

  // Remove the makeup notification for this parent
  try {
    const { data: bookingDetail } = await adminClient
      .from('makeup_bookings')
      .select('student_id, session_date')
      .eq('id', bookingId)
      .single();

    if (bookingDetail) {
      const { data: studentRow } = await adminClient
        .from('students')
        .select('parent_id, users!students_user_id_fkey(full_name)')
        .eq('id', bookingDetail.student_id)
        .single();

      if (studentRow) {
        const parentId = (studentRow as Record<string, unknown>).parent_id as string;
        const userObj = (studentRow as Record<string, unknown>).users as unknown as
          | Record<string, string>
          | Record<string, string>[];
        const studentName = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;

        // Delete notification matching this student + formatted date
        if (studentName) {
          const dateStr = new Date(bookingDetail.session_date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          await adminClient
            .from('notifications')
            .delete()
            .eq('user_id', parentId)
            .eq('type', 'makeup')
            .like('message', `%${studentName}%`)
            .like('message', `%${dateStr}%`);
        }
      }
    }
  } catch {
    // Non-critical
  }

  // Auto-book next waiting student from makeup waitlist
  if (booking) {
    try {
      if (booking.makeup_session_id) {
        // Dedicated makeup session → use dedicated auto-book
        await autoBookDedicatedMakeupFromWaitlist(booking.makeup_session_id);
      } else if (booking.host_class_id) {
        // Regular alternate session → use existing auto-book
        await autoBookMakeupFromWaitlist(booking.host_class_id, booking.session_number);
      }
    } catch {
      // Non-fatal
    }
  }

  return { success: true };
}
