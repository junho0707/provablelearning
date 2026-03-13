'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCheckoutSession } from '@/lib/stripe/create-checkout';
import { getPriceForEnrollment } from '@/lib/constants';
import type { GroupSizeType } from '@/lib/types';

export async function payNowAction(enrollmentId: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated.' };
  }

  const adminSupabase = createAdminClient();

  // Fetch enrollment
  const { data: enrollment } = await adminSupabase
    .from('enrollments')
    .select('id, student_id, class_id, slot_1_class_id, slot_2_class_id, status, payment_status, stripe_session_id')
    .eq('id', enrollmentId)
    .single();

  if (!enrollment) {
    return { error: 'Enrollment not found.' };
  }

  if (enrollment.status !== 'active' || enrollment.payment_status !== 'unpaid') {
    return { error: 'This enrollment does not require payment.' };
  }

  // Verify ownership
  const { data: student } = await adminSupabase
    .from('students')
    .select('user_id, parent_id')
    .eq('id', enrollment.student_id)
    .single();

  if (!student) {
    return { error: 'Student not found.' };
  }

  if (student.parent_id !== user.id && student.user_id !== user.id) {
    return { error: 'Not authorized.' };
  }

  // Get class info for Stripe (name from classes directly)
  const slot1Id = enrollment.slot_1_class_id || enrollment.class_id;
  const { data: cls } = await adminSupabase
    .from('classes')
    .select('name, group_size_type')
    .eq('id', slot1Id)
    .single();

  if (!cls) {
    return { error: 'Class not found.' };
  }

  const groupSizeType = cls.group_size_type as GroupSizeType;
  const price = getPriceForEnrollment(groupSizeType);
  const className = cls.name || 'Digital SAT Class';

  // Create Stripe Checkout session
  const session = await createCheckoutSession({
    enrollmentId: enrollment.id,
    studentId: enrollment.student_id,
    classId: slot1Id,
    groupSizeType,
    className,
    amountInCents: price,
    customerEmail: user.email || undefined,
    isPayLater: true,
  });

  if (!session.url) {
    return { error: 'Payment system error. Please try again.' };
  }

  // Store stripe_session_id on the enrollment
  await adminSupabase
    .from('enrollments')
    .update({ stripe_session_id: session.id })
    .eq('id', enrollmentId);

  return { url: session.url };
}
