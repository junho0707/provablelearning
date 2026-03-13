'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { computeSessionDates } from '@/lib/scheduling/session-dates';

interface PerformanceEntry {
  student_id: string;
  attendance: boolean;
  homework_completed: boolean;
  notes: string;
}

export async function logPerformance(params: {
  classId: string;
  weekNumber: number;
  sessionNumber: number;
  entries: PerformanceEntry[];
}) {
  const supabase = await createClient();

  const rows = params.entries.map((entry) => ({
    student_id: entry.student_id,
    class_id: params.classId,
    week_number: params.weekNumber,
    session_number: params.sessionNumber,
    attendance: entry.attendance,
    homework_completed: entry.homework_completed,
    notes: entry.notes || null,
  }));

  // Use class_id for upsert conflict
  const { error } = await supabase
    .from('performance_logs')
    .upsert(rows, { onConflict: 'student_id,class_id,session_number' });

  if (error) return { error: error.message };

  // Log the bulk performance entry
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('admin_logs').insert({
      admin_id: user.id,
      action: 'performance_logged',
      metadata_json: {
        class_id: params.classId,
        week_number: params.weekNumber,
        session_number: params.sessionNumber,
        student_count: params.entries.length,
      },
    });
  }

  // Auto-create absence records for students marked absent (small + one_on_one only)
  if (user) {
    const adminClient = createAdminClient();

    const { data: cls } = await adminClient
      .from('classes')
      .select('meeting_day, group_size_type, class_start_date')
      .eq('id', params.classId)
      .single();

    if (cls && ['small', 'one_on_one'].includes(cls.group_size_type) && cls.class_start_date) {
      const sessions = computeSessionDates(cls.class_start_date, cls.meeting_day, params.sessionNumber);
      const sessionInfo = sessions.find((s) => s.sessionNumber === params.sessionNumber);

      if (sessionInfo) {
        const absentStudents = params.entries.filter((e) => !e.attendance);

        for (const entry of absentStudents) {
          await adminClient.rpc('mark_student_absent', {
            p_student_id: entry.student_id,
            p_class_id: params.classId,
            p_session_number: params.sessionNumber,
            p_session_date: sessionInfo.dateStr,
            p_admin_id: user.id,
          });
        }
      }
    }
  }

  revalidatePath('/admin/performance');
  return {};
}
