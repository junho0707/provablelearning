'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function redeemCreditForMakeup(
  studentId: string,
  classId: string,
  sessionDate: string
): Promise<{
  bookingId?: string;
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

  // Verify ownership
  const { data: studentRow } = await adminClient
    .from('students')
    .select('id, user_id, parent_id')
    .eq('id', studentId)
    .single();

  if (!studentRow) {
    return { error: 'Student not found' };
  }

  if (studentRow.user_id !== user.id && studentRow.parent_id !== user.id) {
    return { error: 'Not authorized' };
  }

  // Get class info
  const { data: cls } = await adminClient
    .from('classes')
    .select('id, name, subject, level, group_size_type, meeting_day, meeting_time')
    .eq('id', classId)
    .single();

  if (!cls) {
    return { error: 'Class not found' };
  }

  // Book using the credit RPC
  const { data, error } = await adminClient.rpc('book_makeup_with_credit', {
    p_student_id: studentId,
    p_class_id: classId,
    p_session_date: sessionDate,
    p_booked_by: user.id,
  });

  if (error) {
    const msg = error.message || 'Unknown error';
    if (msg.includes('No matching credit')) return { error: 'No matching credit available for this class.' };
    if (msg.includes('full')) return { error: 'This class is full. Please try another.' };
    if (msg.includes('Not authorized')) return { error: 'Not authorized.' };
    return { error: msg };
  }

  // Insert notification for parent/independent student
  try {
    const { data: studentInfo } = await adminClient
      .from('students')
      .select('parent_id, user_id, users!students_user_id_fkey(full_name)')
      .eq('id', studentId)
      .single();

    if (studentInfo) {
      const parentId = (studentInfo as Record<string, unknown>).parent_id as string | null;
      const userId = (studentInfo as Record<string, unknown>).user_id as string | null;
      const userObj = (studentInfo as Record<string, unknown>).users as unknown as
        | Record<string, string>
        | Record<string, string>[];
      const studentName = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;
      const notifyUserId = parentId || userId;

      if (notifyUserId) {
        await adminClient.from('notifications').insert({
          user_id: notifyUserId,
          message: `Credit redeemed for ${studentName || 'student'} — ${cls.name || 'class'} (${cls.meeting_day} at ${cls.meeting_time})`,
          type: 'makeup',
        });
      }
    }
  } catch {
    // Non-critical
  }

  return {
    bookingId: data as string,
  };
}
