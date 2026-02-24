'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

interface PerformanceEntry {
  student_id: string;
  attendance: boolean;
  homework_completed: boolean;
  notes: string;
}

export async function logPerformance(params: {
  courseId: string;
  weekNumber: number;
  sessionNumber: number;
  entries: PerformanceEntry[];
}) {
  const supabase = await createClient();

  const rows = params.entries.map((entry) => ({
    student_id: entry.student_id,
    course_id: params.courseId,
    week_number: params.weekNumber,
    session_number: params.sessionNumber,
    attendance: entry.attendance,
    homework_completed: entry.homework_completed,
    notes: entry.notes || null,
  }));

  const { error } = await supabase
    .from('performance_logs')
    .upsert(rows, { onConflict: 'student_id,course_id,session_number' });

  if (error) return { error: error.message };

  // Log the bulk performance entry to admin_logs
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('admin_logs').insert({
      admin_id: user.id,
      action: 'performance_logged',
      metadata_json: {
        course_id: params.courseId,
        week_number: params.weekNumber,
        session_number: params.sessionNumber,
        student_count: params.entries.length,
      },
    });
  }

  revalidatePath('/admin/performance');
  return {};
}
