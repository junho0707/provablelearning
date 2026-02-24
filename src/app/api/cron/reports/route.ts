import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get all students with active enrollments
  const { data: students } = await supabase
    .from('students')
    .select(`
      id, user_id,
      users!students_user_id_fkey(full_name),
      enrollments!inner(
        course_id, status,
        courses(name, subject)
      )
    `)
    .eq('enrollments.status', 'active');

  if (!students) {
    return NextResponse.json({ reports: 0 });
  }

  let reportCount = 0;

  for (const student of students) {
    // Get performance logs for this student
    const { data: perfLogs } = await supabase
      .from('performance_logs')
      .select('*')
      .eq('student_id', student.id)
      .order('session_number');

    // TODO: Generate PDF using a PDF library (e.g., @react-pdf/renderer)
    // TODO: Email PDF to parent

    reportCount++;
  }

  return NextResponse.json({ reports: reportCount });
}
