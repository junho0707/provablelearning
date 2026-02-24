'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEligibility } from '@/lib/enrollment/check-eligibility';
import { reserveSeat } from '@/lib/enrollment/reserve';
import { createCheckoutSession, getPriceForGroupSize } from '@/lib/stripe/create-checkout';
import { getCreditBalance } from '@/lib/credits/get-balance';
import { applyCredits } from '@/lib/credits/apply-credits';
import type { GroupSizeType } from '@/lib/types';
import { joinWaitlist } from '@/lib/waitlist/join';
import { redirect } from 'next/navigation';

const stripeEnabled = process.env.STRIPE_ENABLED === 'true';

async function verifyStudentOwnership(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  studentId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('students')
    .select('user_id, parent_id')
    .eq('id', studentId)
    .single();

  if (!data) return false;
  // Parent owns their child's student record, OR independent student owns their own
  return data.parent_id === userId || data.user_id === userId;
}

export async function joinWaitlistAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const studentId = formData.get('student_id') as string;
  const classId = formData.get('class_id') as string;
  const agreementVersion = formData.get('agreement_version') as string;
  const agreementTimestamp = formData.get('agreement_timestamp') as string;

  if (!studentId || !classId) {
    redirect(`/enroll?error=missing_fields`);
  }

  if (!agreementVersion || !agreementTimestamp) {
    redirect(`/enroll?error=${encodeURIComponent('Agreements must be accepted before joining waitlist.')}`);
  }

  // Verify the authenticated user owns this student
  const isOwner = await verifyStudentOwnership(adminSupabase, user.id, studentId);
  if (!isOwner) {
    redirect(`/enroll?error=unauthorized`);
  }

  // Check eligibility before joining waitlist (prevents already-enrolled students from waitlisting)
  const { data: cls } = await supabase
    .from('classes')
    .select('course_id')
    .eq('id', classId)
    .single();

  if (!cls) {
    redirect(`/enroll?error=${encodeURIComponent('Class not found.')}`);
  }

  const eligibility = await checkEligibility(supabase, studentId, classId, cls.course_id);
  if (!eligibility.eligible) {
    redirect(`/enroll?error=${encodeURIComponent(eligibility.reason || 'Not eligible.')}`);
  }

  const { error } = await joinWaitlist(adminSupabase, studentId, classId, agreementVersion, agreementTimestamp);
  if (error) {
    redirect(`/enroll?error=${encodeURIComponent(error)}`);
  }

  redirect(`/enroll?waitlisted=${classId}`);
}

export async function enrollAction(formData: FormData) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const studentId = formData.get('student_id') as string;
  const classId = formData.get('class_id') as string;
  const courseId = formData.get('course_id') as string;
  const agreementVersion = formData.get('agreement_version') as string;
  const agreementTimestamp = formData.get('agreement_timestamp') as string;

  if (!studentId || !classId || !courseId) {
    return { error: 'Missing required fields.' };
  }

  if (!agreementVersion || !agreementTimestamp) {
    return { error: 'Agreements must be accepted before enrollment.' };
  }

  // 1. Verify the authenticated user owns this student
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: 'Not authenticated.' };
  }

  const isOwner = await verifyStudentOwnership(adminSupabase, authUser.id, studentId);
  if (!isOwner) {
    return { error: 'You are not authorized to enroll this student.' };
  }

  // 2. Check eligibility
  const eligibility = await checkEligibility(supabase, studentId, classId, courseId);
  if (!eligibility.eligible) {
    return { error: eligibility.reason || 'Not eligible for enrollment.' };
  }

  // 3. Get class details
  const { data: cls } = await supabase
    .from('classes')
    .select('group_size_type, courses(name)')
    .eq('id', classId)
    .single();

  if (!cls) {
    return { error: 'Class not found.' };
  }

  const groupSizeType = cls.group_size_type as GroupSizeType;

  // 4. Check credit balance for this group size type
  const creditBalances = await getCreditBalance(adminSupabase, studentId);
  const hasMatchingCredit = creditBalances[groupSizeType] > 0;

  // 5. Reserve seat via RPC (atomic, race-safe)
  const { enrollmentId, error: reserveError } = await reserveSeat(
    adminSupabase,
    studentId,
    classId,
    courseId,
    agreementVersion,
    agreementTimestamp
  );

  if (reserveError || !enrollmentId) {
    return { error: reserveError || 'Failed to reserve seat.' };
  }

  // 5a. Consume waitlist entry AFTER successful reservation (waiting or notified)
  await adminSupabase
    .from('waitlist')
    .update({ status: 'converted' })
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .in('status', ['waiting', 'notified']);

  // 6. If student has a matching credit, apply it and activate directly
  if (hasMatchingCredit) {
    const creditResult = await applyCredits(adminSupabase, studentId, groupSizeType);
    if (creditResult.error || creditResult.applied === 0) {
      // Credit expired between balance check and application
      // Fall through to Stripe/direct activation below
    } else {
      // Credit applied successfully — activate enrollment
      const { error: activateError } = await adminSupabase
        .from('enrollments')
        .update({
          status: 'active',
          credits_applied: 1,
          credits_group_size_type: groupSizeType,
        })
        .eq('id', enrollmentId);

      if (activateError) {
        // Enrollment update failed — reverse the consumed credit
        console.error('Failed to activate credit-paid enrollment:', activateError.message);
        await adminSupabase.rpc('reverse_credits', {
          p_student_id: studentId,
          p_group_size_type: groupSizeType,
          p_reason: 'Enrollment activation failed — credits reversed',
        });
        // Delete the pending enrollment
        await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
        return { error: 'System error activating enrollment. Credits have been restored. Please try again.' };
      }

      return { redirectTo: '/enroll/success?paid_with_credits=true' };
    }
  }

  // 7. If Stripe is disabled, activate directly (testing mode)
  if (!stripeEnabled) {
    await adminSupabase
      .from('enrollments')
      .update({ status: 'active' })
      .eq('id', enrollmentId);
    return { redirectTo: '/enroll/success?test_mode=true' };
  }

  // 8. Create Stripe Checkout Session
  const price = getPriceForGroupSize(groupSizeType);
  const courses = cls.courses as unknown as Record<string, string> | Record<string, string>[];
  const courseObj = Array.isArray(courses) ? courses[0] : courses;
  const courseName = courseObj?.name || 'SAT Course';

  let session;
  try {
    session = await createCheckoutSession({
      enrollmentId,
      studentId,
      classId,
      groupSizeType,
      courseName,
      amountInCents: price,
      customerEmail: authUser.email || undefined,
    });
  } catch (err) {
    await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    console.error('Stripe checkout creation failed:', err);
    return { error: 'Payment system error. Please try again.' };
  }

  if (!session.url) {
    await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    return { error: 'Payment system error. Please try again.' };
  }

  // 8. Store stripe_session_id BEFORE redirecting
  const { error: updateError } = await adminSupabase
    .from('enrollments')
    .update({ stripe_session_id: session.id })
    .eq('id', enrollmentId);

  if (updateError) {
    console.error('Failed to store stripe_session_id:', updateError.message);
    await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    return { error: 'System error. Please try again.' };
  }

  // 9. Redirect to Stripe (client-side to preserve session cookies)
  return { redirectTo: session.url };
}
