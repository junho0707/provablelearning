'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe/client';
import type { GroupSizeType } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { dispatchWaitlistAutoEnroll } from '@/lib/waitlist/auto-enroll';
import { removeStudentFromClassroom } from '@/lib/google/classroom';
import { sendEmail } from '@/lib/notifications/send-email';

export async function approveRefundRequest(formData: FormData) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const requestId = formData.get('request_id') as string;
  const refundType = formData.get('refund_type') as string;
  const adminNotes = (formData.get('admin_notes') as string)?.trim() || null;

  // Fetch refund request
  const { data: request } = await adminSupabase
    .from('refund_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (!request || request.status !== 'pending') {
    return { error: 'Request not found or already resolved.' };
  }

  // Fetch enrollment details
  const { data: enrollment } = await adminSupabase
    .from('enrollments')
    .select('id, class_id, student_id, stripe_session_id, credits_applied, credits_group_size_type')
    .eq('id', request.enrollment_id)
    .single();

  if (!enrollment) {
    return { error: 'Enrollment not found.' };
  }

  const groupSizeType = enrollment.credits_group_size_type as GroupSizeType;

  // 1. Process Stripe refund FIRST if applicable (fail-safe ordering)
  if (refundType === 'stripe_refund' && enrollment.stripe_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(enrollment.stripe_session_id);
      if (session.payment_intent) {
        await stripe.refunds.create({
          payment_intent: session.payment_intent as string,
        });
      }
    } catch (err) {
      console.error('Stripe refund failed:', err);
      return { error: 'Stripe refund failed. Request unchanged. Please retry.' };
    }
  }

  // 2. Handle credit reversal or credit issuance
  if (refundType === 'credit_reversal' || refundType === 'credit') {
    const { data: student } = await adminSupabase
      .from('students')
      .select('id')
      .eq('user_id', enrollment.student_id)
      .single();

    if (student) {
      if (refundType === 'credit_reversal') {
        await adminSupabase.rpc('reverse_credits', {
          p_student_id: student.id,
          p_group_size_type: groupSizeType,
          p_reason: `Refund for enrollment ${enrollment.id}`,
        });
      } else {
        await adminSupabase.from('credits').insert({
          student_id: student.id,
          group_size_type: groupSizeType,
          amount: 1,
          remaining_amount: 1,
          reason: `Refund for enrollment ${enrollment.id}`,
        });
      }
    }
  }

  // 3. Update enrollment status to refunded (or canceled if no monetary refund)
  const enrollmentStatus = refundType === 'none' ? 'canceled' : 'refunded';
  await adminSupabase
    .from('enrollments')
    .update({ status: enrollmentStatus })
    .eq('id', enrollment.id);

  // 4. Mark request as approved
  await adminSupabase
    .from('refund_requests')
    .update({
      status: 'approved',
      admin_notes: adminNotes,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  // 5. Remove student from Google Classroom (best-effort)
  try {
    const [{ data: cls }, { data: student }] = await Promise.all([
      adminSupabase.from('classes').select('google_classroom_id').eq('id', enrollment.class_id).single(),
      adminSupabase.from('students').select('user_id').eq('id', enrollment.student_id).single(),
    ]);

    if (cls?.google_classroom_id && student?.user_id) {
      const { data: { user: studentUser } } = await adminSupabase.auth.admin.getUserById(student.user_id);
      if (studentUser?.email) {
        await removeStudentFromClassroom({
          classroomId: cls.google_classroom_id,
          studentEmail: studentUser.email,
        });
      }
    }
  } catch (err) {
    console.error('Failed to remove student from Classroom on refund:', err);
  }

  // 6. Log admin action
  await adminSupabase.from('admin_logs').insert({
    admin_id: user.id,
    action: 'refund_processed',
    metadata_json: {
      request_id: requestId,
      enrollment_id: enrollment.id,
      refund_type: refundType,
      group_size_type: groupSizeType,
      source: 'refund_request_approval',
    },
  });

  // 7. Notify parent (in-app + email)
  try {
    const { data: parentUser } = await adminSupabase.auth.admin.getUserById(request.parent_id);
    const refundLabel = refundType === 'stripe_refund' ? 'A Stripe refund has been issued.'
      : refundType === 'credit_reversal' ? 'Your credits have been reversed.'
      : refundType === 'credit' ? 'A lesson credit has been issued.'
      : 'No monetary refund was applied.';
    const message = `Your refund request has been approved. ${refundLabel}`;

    await adminSupabase.from('notifications').insert({
      user_id: request.parent_id,
      message,
      type: 'refund',
    });

    if (parentUser?.user?.email) {
      await sendEmail({
        to: parentUser.user.email,
        subject: 'Refund Request Approved — Provable Learning',
        html: `<p>Hi,</p><p>${message}</p>${adminNotes ? `<p><strong>Admin notes:</strong> ${adminNotes}</p>` : ''}<p>Thank you,<br/>Provable Learning</p>`,
      });
    }
  } catch (err) {
    console.error('Failed to notify parent on refund approval:', err);
  }

  // 8. Auto-enroll next waitlisted student
  try {
    await dispatchWaitlistAutoEnroll(enrollment.class_id);
  } catch {
    // Non-fatal: cron will handle it
  }

  revalidatePath('/admin/refund-requests');
  return { success: true };
}

export async function denyRefundRequest(formData: FormData) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const requestId = formData.get('request_id') as string;
  const adminNotes = (formData.get('admin_notes') as string)?.trim() || null;

  // Fetch request to get parent_id for notification
  const { data: request } = await adminSupabase
    .from('refund_requests')
    .select('parent_id, enrollment_id')
    .eq('id', requestId)
    .single();

  if (!request) {
    return { error: 'Request not found.' };
  }

  const { error } = await adminSupabase
    .from('refund_requests')
    .update({
      status: 'denied',
      admin_notes: adminNotes,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) {
    return { error: 'Failed to update request.' };
  }

  // Log admin action
  await adminSupabase.from('admin_logs').insert({
    admin_id: user.id,
    action: 'refund_denied',
    metadata_json: {
      request_id: requestId,
      enrollment_id: request.enrollment_id,
      admin_notes: adminNotes,
    },
  });

  // Notify parent (in-app + email)
  try {
    const message = 'Your refund request has been denied.' + (adminNotes ? ` Reason: ${adminNotes}` : '');

    await adminSupabase.from('notifications').insert({
      user_id: request.parent_id,
      message,
      type: 'refund',
    });

    const { data: parentUser } = await adminSupabase.auth.admin.getUserById(request.parent_id);
    if (parentUser?.user?.email) {
      await sendEmail({
        to: parentUser.user.email,
        subject: 'Refund Request Update — Provable Learning',
        html: `<p>Hi,</p><p>${message}</p><p>If you have questions, please reach out to us.</p><p>Thank you,<br/>Provable Learning</p>`,
      });
    }
  } catch (err) {
    console.error('Failed to notify parent on refund denial:', err);
  }

  revalidatePath('/admin/refund-requests');
  return { success: true };
}
