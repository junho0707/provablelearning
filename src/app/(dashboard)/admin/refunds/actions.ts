'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe/client';
import type { GroupSizeType } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { autoEnrollFromWaitlist } from '@/lib/waitlist/auto-enroll';

export async function processRefund(formData: FormData) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const enrollmentId = formData.get('enrollment_id') as string;
  const studentId = formData.get('student_id') as string;
  const groupSizeType = formData.get('group_size_type') as GroupSizeType;
  const stripeSessionId = formData.get('stripe_session_id') as string;
  const refundType = formData.get('refund_type') as string;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get class_id from enrollment before modifying it (needed for waitlist notification)
  const { data: enrollment } = await adminSupabase
    .from('enrollments')
    .select('class_id')
    .eq('id', enrollmentId)
    .single();

  if (!enrollment) {
    return { error: 'Enrollment not found.' };
  }

  // For Stripe refunds, process payment refund BEFORE updating enrollment status
  if (refundType === 'stripe_refund' && stripeSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
      if (session.payment_intent) {
        await stripe.refunds.create({
          payment_intent: session.payment_intent as string,
        });
      }
    } catch (err) {
      console.error('Stripe refund failed:', err);
      return { error: 'Stripe refund failed. Enrollment status unchanged. Please retry.' };
    }
  }

  // Update enrollment status only after successful Stripe refund (or non-Stripe refund)
  const refundStatus = refundType === 'none' ? 'canceled' : 'refunded';
  await adminSupabase
    .from('enrollments')
    .update({ status: refundStatus })
    .eq('id', enrollmentId);

  if (refundType === 'credit_reversal') {
    // Reverse the credit that was used to pay for this enrollment
    // Find student's internal id
    const { data: student } = await adminSupabase
      .from('students')
      .select('id')
      .eq('user_id', studentId)
      .single();

    if (student) {
      await adminSupabase.rpc('reverse_credits', {
        p_student_id: student.id,
        p_group_size_type: groupSizeType,
        p_reason: `Refund for enrollment ${enrollmentId}`,
      });
    }
  } else if (refundType === 'credit') {
    // Issue 1 lesson credit of the matching group size type
    // Find student's internal id
    const { data: student } = await adminSupabase
      .from('students')
      .select('id')
      .eq('user_id', studentId)
      .single();

    if (student) {
      await adminSupabase.from('credits').insert({
        student_id: student.id,
        group_size_type: groupSizeType,
        amount: 1,
        remaining_amount: 1,
        reason: `Refund for enrollment ${enrollmentId}`,
      });
    }
  }

  // Log admin action
  if (user) {
    await adminSupabase.from('admin_logs').insert({
      admin_id: user.id,
      action: 'refund_processed',
      metadata_json: {
        enrollment_id: enrollmentId,
        refund_type: refundType,
        group_size_type: groupSizeType,
      },
    });
  }

  // FIX #12: Notify next waitlisted student since a seat was freed
  await autoEnrollFromWaitlist(enrollment.class_id);

  revalidatePath('/admin/refunds');
}
