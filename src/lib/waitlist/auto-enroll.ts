import { createAdminClient } from '@/lib/supabase/admin';
import { inviteStudentToClassroom } from '@/lib/google/classroom';
import { notifySgWaitlistNext } from './notify-sg-next';

interface AutoEnrollResult {
  enrollment_id: string;
  student_id: string;
  waitlist_id: string;
}

export async function autoEnrollFromWaitlist(
  classId: string
): Promise<AutoEnrollResult | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('auto_enroll_from_waitlist', {
    p_class_id: classId,
  });

  if (error) {
    console.error('auto_enroll_from_waitlist RPC error:', error.message);
    return null;
  }

  // RPC returns a table; data is an array
  const rows = data as AutoEnrollResult[] | null;
  if (!rows || rows.length === 0) return null;

  const result = rows[0];

  // Invite auto-enrolled student to Google Classroom (best-effort)
  try {
    const [{ data: cls }, { data: student }] = await Promise.all([
      supabase.from('classes').select('google_classroom_id, google_classroom_enrollment_code').eq('id', classId).single(),
      supabase.from('students').select('user_id, email').eq('id', result.student_id).single(),
    ]);

    if (cls?.google_classroom_id) {
      const studentEmail = student?.email || (student?.user_id
        ? (await supabase.auth.admin.getUserById(student.user_id)).data?.user?.email
        : null);
      if (studentEmail) {
        const classroomResult = await inviteStudentToClassroom({
          classroomId: cls.google_classroom_id,
          studentEmail,
          enrollmentCode: cls.google_classroom_enrollment_code,
        });
        if (classroomResult.success && !classroomResult.selfJoinRequired) {
          await supabase.from('enrollments').update({ classroom_joined: true }).eq('id', result.enrollment_id);
        }
      }
    }
  } catch (err) {
    console.error('Classroom invite failed (auto-enroll):', err);
  }

  return result;
}

export async function autoEnrollSgFromWaitlist(
  classId: string
): Promise<AutoEnrollResult | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('auto_enroll_sg_from_waitlist', {
    p_class_id: classId,
  });

  if (error) {
    console.error('auto_enroll_sg_from_waitlist RPC error:', error.message);
    return null;
  }

  const rows = data as AutoEnrollResult[] | null;
  if (!rows || rows.length === 0) return null;

  const result = rows[0];

  // Invite auto-enrolled student to Google Classroom for both slots (best-effort)
  try {
    // Fetch the enrollment to get slot_1 and slot_2 class IDs
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('slot_1_class_id, slot_2_class_id')
      .eq('id', result.enrollment_id)
      .single();

    const slotClassIds = [enrollment?.slot_1_class_id, enrollment?.slot_2_class_id].filter(Boolean) as string[];

    const { data: student } = await supabase
      .from('students')
      .select('user_id, email')
      .eq('id', result.student_id)
      .single();

    const studentEmail = student?.email || (student?.user_id
      ? (await supabase.auth.admin.getUserById(student.user_id)).data?.user?.email
      : null);

    if (studentEmail) {
      for (const slotClassId of slotClassIds) {
        const { data: cls } = await supabase
          .from('classes')
          .select('google_classroom_id, google_classroom_enrollment_code')
          .eq('id', slotClassId)
          .single();

        if (cls?.google_classroom_id) {
          const classroomResult = await inviteStudentToClassroom({
            classroomId: cls.google_classroom_id,
            studentEmail,
            enrollmentCode: cls.google_classroom_enrollment_code,
          });
          if (classroomResult.success && !classroomResult.selfJoinRequired) {
            await supabase.from('enrollments').update({ classroom_joined: true }).eq('id', result.enrollment_id);
          }
        }
      }
    }
  } catch (err) {
    console.error('Classroom invite failed (SG auto-enroll):', err);
  }

  return result;
}

export type DispatchResult =
  | { action: 'enrolled'; data: AutoEnrollResult }
  | { action: 'notified' }
  | { action: 'none' };

/**
 * Dispatch to the correct auto-enroll function based on class group_size_type.
 * LG: auto-enroll immediately.
 * SG/1:1: notify-then-accept (3-day offer window).
 */
export async function dispatchWaitlistAutoEnroll(
  classId: string
): Promise<DispatchResult> {
  const supabase = createAdminClient();

  const { data: cls } = await supabase
    .from('classes')
    .select('group_size_type')
    .eq('id', classId)
    .single();

  if (!cls) return { action: 'none' };

  if (cls.group_size_type === 'small' || cls.group_size_type === 'one_on_one') {
    const notified = await notifySgWaitlistNext(classId);
    return notified ? { action: 'notified' } : { action: 'none' };
  }

  // LG: auto-enroll immediately
  const result = await autoEnrollFromWaitlist(classId);
  return result ? { action: 'enrolled', data: result } : { action: 'none' };
}
