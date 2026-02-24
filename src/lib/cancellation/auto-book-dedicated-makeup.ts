import { createAdminClient } from '@/lib/supabase/admin';

interface AutoBookResult {
  booking_id: string;
  student_id: string;
  waitlist_id: string;
}

export async function autoBookDedicatedMakeupFromWaitlist(
  makeupSessionId: string
): Promise<AutoBookResult | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('auto_book_dedicated_makeup_from_waitlist', {
    p_makeup_session_id: makeupSessionId,
  });

  if (error) {
    console.error('auto_book_dedicated_makeup_from_waitlist RPC error:', error.message);
    return null;
  }

  const rows = data as AutoBookResult[] | null;
  if (!rows || rows.length === 0) return null;

  const result = rows[0];

  // Insert parent notification for the auto-booked makeup
  try {
    const { data: studentRow } = await supabase
      .from('students')
      .select('parent_id, users!students_user_id_fkey(full_name)')
      .eq('id', result.student_id)
      .single();

    if (studentRow) {
      const parentId = (studentRow as Record<string, unknown>).parent_id as string;
      const userObj = (studentRow as Record<string, unknown>).users as unknown as
        | Record<string, string>
        | Record<string, string>[];
      const studentName = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;

      // Fetch makeup session details for the notification message
      const { data: msRow } = await supabase
        .from('makeup_sessions')
        .select('session_date, session_time')
        .eq('id', makeupSessionId)
        .single();

      const dateStr = msRow?.session_date
        ? new Date(msRow.session_date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : '';

      await supabase.from('notifications').insert({
        user_id: parentId,
        message: `Makeup auto-booked for ${studentName || 'your child'}${dateStr ? ` — ${dateStr}` : ''}${msRow?.session_time ? ` at ${msRow.session_time}` : ''}`,
        type: 'makeup',
      });
    }
  } catch {
    // Non-critical
  }

  return result;
}
