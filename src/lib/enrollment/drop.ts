'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchWaitlistAutoEnroll } from '@/lib/waitlist/auto-enroll';
import { removeStudentFromClassroom } from '@/lib/google/classroom';

export async function dropEnrollment(
  enrollmentId: string,
  reason: string,
  phase: number = 1
): Promise<{ success?: boolean; classId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const adminClient = createAdminClient();

  // Fetch enrollment + student info before drop
  const { data: enrollment } = await adminClient
    .from('enrollments')
    .select('class_id, student_id, slot_1_class_id, slot_2_class_id')
    .eq('id', enrollmentId)
    .single();

  if (!enrollment) {
    return { error: 'Enrollment not found' };
  }

  const { error } = await adminClient.rpc('drop_enrollment', {
    p_enrollment_id: enrollmentId,
    p_reason: reason,
    p_dropped_by: user.id,
    p_phase: phase,
  });

  if (error) {
    const msg = error.message || 'Unknown error';
    if (msg.includes('not active')) return { error: 'This enrollment is not currently active.' };
    if (msg.includes('Not authorized')) return { error: 'You are not authorized to drop this enrollment.' };
    if (msg.includes('Cannot self-drop')) return { error: msg };
    if (msg.includes('not found')) return { error: 'Enrollment not found.' };
    return { error: msg };
  }

  // Log to admin_logs for audit trail
  try {
    await adminClient.from('admin_logs').insert({
      admin_id: user.id,
      action: 'enrollment_dropped',
      metadata_json: {
        enrollment_id: enrollmentId,
        slot_1_class_id: enrollment.slot_1_class_id,
        slot_2_class_id: enrollment.slot_2_class_id,
        phase,
        reason,
      },
    });
  } catch {
    // Non-fatal
  }

  // Remove student from Google Classroom for both slots (best-effort)
  try {
    const { data: student } = await adminClient
      .from('students')
      .select('user_id')
      .eq('id', enrollment.student_id)
      .single();

    if (student?.user_id) {
      const { data: { user: studentUser } } = await adminClient.auth.admin.getUserById(student.user_id);
      if (studentUser?.email) {
        const classIds = [
          enrollment.slot_1_class_id || enrollment.class_id,
          enrollment.slot_2_class_id,
        ].filter(Boolean) as string[];

        for (const cId of classIds) {
          const { data: cls } = await adminClient
            .from('classes')
            .select('google_classroom_id')
            .eq('id', cId)
            .single();

          if (cls?.google_classroom_id) {
            await removeStudentFromClassroom({
              classroomId: cls.google_classroom_id,
              studentEmail: studentUser.email,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to remove student from Classroom on drop:', err);
  }

  // Auto-enroll next waitlisted student for both slots
  const classIds = [
    enrollment.slot_1_class_id || enrollment.class_id,
    enrollment.slot_2_class_id,
  ].filter(Boolean) as string[];

  for (const cId of classIds) {
    try {
      await dispatchWaitlistAutoEnroll(cId);
    } catch {
      // Non-fatal
    }
  }

  return { success: true, classId: enrollment.class_id };
}
