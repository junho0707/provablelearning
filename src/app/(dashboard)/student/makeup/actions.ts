'use server';

import { createClient } from '@/lib/supabase/server';

export async function requestMakeup(params: {
  courseId: string;
  sessionNumber: number;
  reason: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated.' };

  // Get student record
  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!student) return { error: 'Student not found.' };

  // Check active enrollment in this course
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id, classes(group_size_type)')
    .eq('student_id', student.id)
    .eq('course_id', params.courseId)
    .eq('status', 'active')
    .single();

  if (!enrollment) return { error: 'No active enrollment in this course.' };

  const classesData = enrollment.classes as unknown as Record<string, string> | Record<string, string>[];
  const classObj = Array.isArray(classesData) ? classesData[0] : classesData;
  const groupType = classObj?.group_size_type;

  // Check makeup count for small groups (max 2)
  if (groupType === 'small') {
    const { count } = await supabase
      .from('admin_logs')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'student_makeup_request')
      .contains('metadata_json', {
        student_id: student.id,
        course_id: params.courseId,
      });

    if (count && count >= 2) {
      return { error: 'Maximum 2 makeup cancellations per small group course.' };
    }
  }

  // Log the makeup request in admin_logs (student action, not admin — admin_id is the student's user id)
  const { error } = await supabase.from('admin_logs').insert({
    admin_id: user.id,
    action: 'student_makeup_request',
    metadata_json: {
      student_id: student.id,
      course_id: params.courseId,
      session_number: params.sessionNumber,
      reason: params.reason,
      group_size_type: groupType,
      status: 'pending_review',
      submitted_at: new Date().toISOString(),
      note_to_admin: groupType === 'small'
        ? 'Small group: verify 24-hour advance notice before approving'
        : groupType === 'one_on_one'
          ? '1:1: reschedule based on tutor availability'
          : 'Medium/large: verify makeup availability',
    },
  });

  if (error) return { error: error.message };
  return {};
}
