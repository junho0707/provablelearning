import { createAdminClient } from '@/lib/supabase/admin';
import { inviteStudentToClassroom } from '@/lib/google/classroom';
import { formatTime } from '@/lib/constants';

interface AutoBookResult {
  booking_id: string;
  student_id: string;
  waitlist_id: string;
}

export async function autoBookMakeupFromWaitlist(
  hostClassId: string,
  sessionNumber: number
): Promise<AutoBookResult | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('auto_book_makeup_from_waitlist', {
    p_host_class_id: hostClassId,
    p_session_number: sessionNumber,
  });

  if (error) {
    console.error('auto_book_makeup_from_waitlist RPC error:', error.message);
    return null;
  }

  // RPC returns a table; data is an array
  const rows = data as AutoBookResult[] | null;
  if (!rows || rows.length === 0) return null;

  const result = rows[0];

  // Insert parent notification for the auto-booked makeup
  try {
    const { data: studentRow } = await supabase
      .from('students')
      .select('parent_id, user_id, users!students_user_id_fkey(full_name)')
      .eq('id', result.student_id)
      .single();

    if (studentRow) {
      const parentId = (studentRow as Record<string, unknown>).parent_id as string | null;
      const userId = (studentRow as Record<string, unknown>).user_id as string | null;
      const userObj = (studentRow as Record<string, unknown>).users as unknown as
        | Record<string, string>
        | Record<string, string>[];
      const studentName = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;

      // Fetch booking details for the notification message
      const { data: booking } = await supabase
        .from('makeup_bookings')
        .select('session_date, host_class_id, classes!makeup_bookings_host_class_id_fkey(meeting_day, meeting_time)')
        .eq('id', result.booking_id)
        .single();

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

      const notifyUserId = parentId || userId;
      if (notifyUserId) {
        await supabase.from('notifications').insert({
          user_id: notifyUserId,
          message: `Makeup auto-booked for ${studentName || 'you'}${dateStr ? ` — ${dateStr}` : ''}${meetingTime ? ` at ${formatTime(meetingTime)}` : ''}`,
          type: 'makeup',
        });
      }
    }
  } catch {
    // Non-critical — don't fail the auto-book if notification insert fails
  }

  // Invite student to host class's Google Classroom (best-effort)
  try {
    const { data: booking } = await supabase
      .from('makeup_bookings')
      .select('host_class_id')
      .eq('id', result.booking_id)
      .single();

    if (booking?.host_class_id) {
      const [{ data: cls }, { data: student }] = await Promise.all([
        supabase.from('classes').select('google_classroom_id, google_classroom_enrollment_code').eq('id', booking.host_class_id).single(),
        supabase.from('students').select('user_id, email').eq('id', result.student_id).single(),
      ]);

      if (cls?.google_classroom_id) {
        const studentEmail = student?.email || (student?.user_id
          ? (await supabase.auth.admin.getUserById(student.user_id)).data?.user?.email
          : null);
        if (studentEmail) {
          await inviteStudentToClassroom({
            classroomId: cls.google_classroom_id,
            studentEmail,
            enrollmentCode: cls.google_classroom_enrollment_code,
          });
        }
      }
    }
  } catch {
    // Non-critical
  }

  return result;
}
