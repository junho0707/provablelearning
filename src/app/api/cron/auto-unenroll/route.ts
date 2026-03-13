import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchWaitlistAutoEnroll } from '@/lib/waitlist/auto-enroll';
import { removeStudentFromClassroom } from '@/lib/google/classroom';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const results = {
    unenrolled: 0,
    errors: [] as string[],
  };

  // Find active + unpaid enrollments past their payment deadline
  const { data: overdue } = await adminClient
    .from('enrollments')
    .select('id, student_id, class_id, slot_1_class_id, slot_2_class_id')
    .eq('status', 'active')
    .eq('payment_status', 'unpaid')
    .not('payment_deadline', 'is', null)
    .lt('payment_deadline', new Date().toISOString().split('T')[0]);

  if (!overdue || overdue.length === 0) {
    return NextResponse.json({ ...results, message: 'No overdue enrollments' });
  }

  for (const enrollment of overdue) {
    try {
      // Cancel the enrollment
      const { error } = await adminClient
        .from('enrollments')
        .update({ status: 'canceled' })
        .eq('id', enrollment.id)
        .eq('status', 'active');

      if (error) {
        results.errors.push(`Failed to cancel ${enrollment.id}: ${error.message}`);
        continue;
      }

      // Log to admin_logs
      const { data: adminUser } = await adminClient
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .single();

      await adminClient.from('admin_logs').insert({
        admin_id: adminUser?.id || '00000000-0000-0000-0000-000000000000',
        action: 'auto_unenroll_unpaid',
        metadata_json: {
          enrollment_id: enrollment.id,
          student_id: enrollment.student_id,
          class_id: enrollment.class_id,
        },
      });

      // Notify parent/student about the unenrollment
      const primaryClassId = enrollment.slot_1_class_id || enrollment.class_id;
      const { data: cls } = await adminClient.from('classes').select('name').eq('id', primaryClassId!).single();
      const className = cls?.name || 'your class';
      const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      // Find the user to notify (parent or independent student)
      const { data: student } = await adminClient.from('students').select('user_id, parent_id').eq('id', enrollment.student_id).single();
      const notifyUserId = student?.parent_id || student?.user_id;
      if (notifyUserId) {
        await adminClient.from('notifications').insert({
          user_id: notifyUserId,
          type: 'enrollment',
          message: `As of ${dateStr}, your enrollment in ${className} was cancelled due to non-payment. Please contact us if you have questions.`,
        });
      }

      // Remove from Google Classroom for both slots (best-effort)
      const slotClassIds = [enrollment.slot_1_class_id, enrollment.slot_2_class_id].filter(Boolean) as string[];
      if (slotClassIds.length === 0 && enrollment.class_id) slotClassIds.push(enrollment.class_id);

      try {
        const { data: student } = await adminClient.from('students').select('user_id, email').eq('id', enrollment.student_id).single();
        const studentEmail = student?.email || (student?.user_id
          ? (await adminClient.auth.admin.getUserById(student.user_id)).data?.user?.email
          : null);

        if (studentEmail) {
          for (const cid of slotClassIds) {
            const { data: cls } = await adminClient.from('classes').select('google_classroom_id').eq('id', cid).single();
            if (cls?.google_classroom_id) {
              await removeStudentFromClassroom({ classroomId: cls.google_classroom_id, studentEmail });
            }
          }
        }
      } catch {
        // Non-fatal
      }

      // Auto-enroll next waitlisted student for each freed slot
      for (const cid of slotClassIds) {
        try {
          await dispatchWaitlistAutoEnroll(cid);
        } catch {
          // Non-fatal
        }
      }

      results.unenrolled++;
    } catch (err) {
      results.errors.push(`Unexpected error for ${enrollment.id}: ${String(err)}`);
    }
  }

  return NextResponse.json(results);
}
