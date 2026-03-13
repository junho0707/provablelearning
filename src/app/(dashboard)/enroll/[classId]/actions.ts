'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEligibility } from '@/lib/enrollment/check-eligibility';
import { reserveSeat } from '@/lib/enrollment/reserve';
import { getPriceForEnrollment } from '@/lib/constants';
import { createCheckoutSession } from '@/lib/stripe/create-checkout';
import { joinWaitlist, joinSgWaitlist } from '@/lib/waitlist/join';
import { inviteStudentToClassroom, createClassroomCourse } from '@/lib/google/classroom';
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
  return data.parent_id === userId || data.user_id === userId;
}

export async function joinWaitlistAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const studentId = formData.get('student_id') as string;
  const classId = formData.get('class_id') as string;
  const groupSizeType = formData.get('group_size_type') as string | null;
  const agreementVersion = formData.get('agreement_version') as string;
  const agreementTimestamp = formData.get('agreement_timestamp') as string;

  if (!agreementVersion || !agreementTimestamp) {
    redirect(`/enroll?error=${encodeURIComponent('Agreements must be accepted before joining waitlist.')}`);
  }

  if (!studentId) {
    redirect(`/enroll?error=missing_fields`);
  }

  const isOwner = await verifyStudentOwnership(adminSupabase, user.id, studentId);
  if (!isOwner) {
    redirect(`/enroll?error=unauthorized`);
  }

  // SG/1:1 waitlist: store preferred slots instead of single class_id
  if (groupSizeType === 'small' || groupSizeType === 'one_on_one') {
    const preferredRaw = formData.get('preferred_class_ids') as string;
    if (!preferredRaw) {
      redirect(`/enroll?error=${encodeURIComponent('Select at least 2 time slots.')}`);
    }

    let preferredClassIds: string[];
    try {
      preferredClassIds = JSON.parse(preferredRaw);
    } catch {
      redirect(`/enroll?error=${encodeURIComponent('Invalid slot selection.')}`);
    }

    const { error } = await joinSgWaitlist(adminSupabase, studentId, preferredClassIds, agreementVersion, agreementTimestamp);
    if (error) {
      redirect(`/enroll?error=${encodeURIComponent(error)}`);
    }

    redirect(`/enroll?waitlisted=sg`);
  }

  // LG/1:1 waitlist: existing single-class path
  if (!classId) {
    redirect(`/enroll?error=missing_fields`);
  }

  const eligibility = await checkEligibility(adminSupabase, studentId, classId);
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
  const slot1ClassId = formData.get('slot_1_class_id') as string;
  const slot2ClassId = formData.get('slot_2_class_id') as string | null;
  const agreementVersion = formData.get('agreement_version') as string;
  const agreementTimestamp = formData.get('agreement_timestamp') as string;
  const paymentChoice = formData.get('payment_choice') as string | null;
  const payLater = paymentChoice === 'pay_later';
  const studentStartDate = formData.get('student_start_date') as string | null;
  const subjectCategory = formData.get('subject_category') as string | null;
  const subjectDetail = formData.get('subject_detail') as string | null;

  if (!studentId || !slot1ClassId) {
    return { error: 'Missing required fields.' };
  }

  if (!agreementVersion || !agreementTimestamp) {
    return { error: 'Agreements must be accepted before enrollment.' };
  }

  // 1. Verify the authenticated user owns this student
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return { error: 'Not authenticated.' };
  }

  const isOwner = await verifyStudentOwnership(adminSupabase, authUser.id, studentId);
  if (!isOwner) {
    return { error: 'You are not authorized to enroll this student.' };
  }

  // 2. Get class details (needed to determine slot count before eligibility check)
  const { data: cls } = await supabase
    .from('classes')
    .select('name, group_size_type')
    .eq('id', slot1ClassId)
    .single();

  if (!cls) {
    return { error: 'Class not found.' };
  }

  const groupSizeType = cls.group_size_type;

  const effectiveSlot2 = slot2ClassId || null;
  const slotCount = effectiveSlot2 ? 2 : 1;

  // 3. Check eligibility
  const eligibility = await checkEligibility(adminSupabase, studentId, slot1ClassId, effectiveSlot2 || undefined);
  if (!eligibility.eligible) {
    return { error: eligibility.reason || 'Not eligible for enrollment.' };
  }

  // 4. Reserve seat via RPC (atomic, race-safe)
  const { enrollmentId, error: reserveError } = await reserveSeat(
    adminSupabase,
    studentId,
    slot1ClassId,
    effectiveSlot2,
    agreementVersion,
    agreementTimestamp,
    payLater,
    studentStartDate || undefined,
    null, // slot3ClassId
    subjectCategory,
    subjectDetail,
    effectiveSlot2 ? 2 : null // slotsPerWeek
  );

  if (reserveError || !enrollmentId) {
    // If slot is full and this is SG/1:1, auto-add to waitlist
    const isFull = reserveError && /full|capacity/i.test(reserveError);
    if (isFull && (groupSizeType === 'small' || groupSizeType === 'one_on_one')) {
      const slotIds = [slot1ClassId, effectiveSlot2].filter(Boolean) as string[];
      const { error: wlError } = await joinSgWaitlist(
        adminSupabase,
        studentId,
        slotIds,
        agreementVersion,
        agreementTimestamp
      );
      if (!wlError) {
        return { waitlisted: true, message: 'One or more slots filled up. You have been added to the waitlist and will be notified when a spot opens.' };
      }
    }
    return { error: reserveError || 'Failed to reserve seat.' };
  }

  // 4a. Consume waitlist entry AFTER successful reservation
  // Single-slot waitlist entries (LG/1:1)
  await adminSupabase
    .from('waitlist')
    .update({ status: 'converted' })
    .eq('student_id', studentId)
    .eq('class_id', slot1ClassId)
    .in('status', ['waiting', 'notified']);

  // SG waitlist entries: mark as converted if preferred_class_ids overlap enrolled slots
  if (effectiveSlot2) {
    const { data: sgEntries } = await adminSupabase
      .from('waitlist')
      .select('id, preferred_class_ids')
      .eq('student_id', studentId)
      .is('class_id', null)
      .in('status', ['waiting', 'notified']);

    if (sgEntries) {
      for (const entry of sgEntries) {
        const prefs = (entry.preferred_class_ids as string[]) || [];
        if (prefs.includes(slot1ClassId) || prefs.includes(effectiveSlot2)) {
          await adminSupabase
            .from('waitlist')
            .update({ status: 'converted' })
            .eq('id', entry.id);
        }
      }
    }
  }

  // 4b. Resolve makeup booking conflicts — auto-cancel conflicting sessions & grant credits
  let conflictDates: string[] = [];
  if (groupSizeType === 'small' || groupSizeType === 'one_on_one') {
    try {
      const { data: conflicts } = await adminSupabase.rpc('resolve_enrollment_makeup_conflicts', {
        p_enrollment_id: enrollmentId,
        p_cancelled_by: authUser.id,
      });
      if (conflicts && Array.isArray(conflicts) && conflicts.length > 0) {
        conflictDates = conflicts.map((c: { conflict_session_date: string }) => c.conflict_session_date);

        // Notify the student/parent about the auto-cancelled sessions
        const { data: studentRow } = await adminSupabase
          .from('students')
          .select('parent_id, user_id')
          .eq('id', studentId)
          .single();
        const notifyUserId = studentRow?.parent_id || studentRow?.user_id;
        if (notifyUserId) {
          const dateList = conflictDates.map(d => {
            const dt = new Date(d + 'T00:00:00');
            return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          }).join(', ');
          await adminSupabase.from('notifications').insert({
            user_id: notifyUserId,
            message: `Your enrollment has scheduling conflicts on ${dateList}. Credits have been issued — please use them to book alternate sessions.`,
            type: 'enrollment',
          });
        }
      }
    } catch (err) {
      console.error('Makeup conflict resolution failed:', err);
    }
  }

  // 4c. Create per-student Google Classroom for SG and 1:1 classes
  console.log('[enroll] groupSizeType:', groupSizeType, '| slot1ClassId:', slot1ClassId);
  if (groupSizeType === 'one_on_one' || groupSizeType === 'small') {
    try {
      const { data: clsForClassroom } = await adminSupabase
        .from('classes')
        .select('google_classroom_id, name, subject, level')
        .eq('id', slot1ClassId)
        .single();

      console.log('[enroll] 1:1 class check — has classroom?', clsForClassroom?.google_classroom_id);
      if (clsForClassroom && !clsForClassroom.google_classroom_id) {
        // Fetch student name for classroom naming
        const { data: studentData } = await adminSupabase
          .from('students')
          .select('user_id')
          .eq('id', studentId)
          .single();
        let studentName = 'Student';
        if (studentData?.user_id) {
          const { data: userData } = await adminSupabase.auth.admin.getUserById(studentData.user_id);
          if (userData?.user?.user_metadata?.full_name) {
            studentName = userData.user.user_metadata.full_name;
          }
        }

        const gsLabel = groupSizeType === 'one_on_one' ? '1:1' : 'Small Group';
        console.log('[enroll] Creating', gsLabel, 'classroom for:', clsForClassroom.name, '| student:', studentName);
        const classroomResult = await createClassroomCourse({
          name: studentName,
          section: `${gsLabel} — ${subjectCategory || 'SAT Prep'}`,
        });

        console.log('[enroll] Classroom creation result:', classroomResult);
        if (classroomResult?.courseId) {
          await adminSupabase
            .from('classes')
            .update({
              google_classroom_id: classroomResult.courseId,
              google_classroom_enrollment_code: classroomResult.enrollmentCode,
              google_classroom_link: classroomResult.alternateLink,
            })
            .eq('id', slot1ClassId);
        }
      }
    } catch (err) {
      console.error('1:1 Classroom creation failed:', err);
    }
  }

  // Helper: invite to Google Classroom for a class
  async function inviteToClassroom(targetClassId: string) {
    try {
      const [{ data: clsData }, { data: student }] = await Promise.all([
        adminSupabase.from('classes').select('google_classroom_id, google_classroom_enrollment_code').eq('id', targetClassId).single(),
        adminSupabase.from('students').select('user_id, email').eq('id', studentId).single(),
      ]);

      if (clsData?.google_classroom_id) {
        const studentEmail = student?.email || (student?.user_id
          ? (await adminSupabase.auth.admin.getUserById(student.user_id)).data?.user?.email
          : null);
        if (studentEmail) {
          const classroomResult = await inviteStudentToClassroom({
            classroomId: clsData.google_classroom_id,
            studentEmail,
            enrollmentCode: clsData.google_classroom_enrollment_code,
          });
          if (classroomResult.success && !classroomResult.selfJoinRequired) {
            await adminSupabase.from('enrollments').update({ classroom_joined: true }).eq('id', enrollmentId);
          }
        }
      }
    } catch (err) {
      console.error('Classroom invite failed:', err);
    }
  }

  // Build conflict query param if any
  const conflictParam = conflictDates.length > 0
    ? `&conflicts=${encodeURIComponent(conflictDates.join(','))}`
    : '';

  // 5a. If pay-later, enrollment is already active+unpaid — skip Stripe
  if (payLater) {
    await inviteToClassroom(slot1ClassId);
    if (effectiveSlot2) await inviteToClassroom(effectiveSlot2);
    // Fetch payment deadline to show on success page
    const { data: enrollmentRow } = await adminSupabase
      .from('enrollments')
      .select('payment_deadline')
      .eq('id', enrollmentId)
      .single();
    const deadlineParam = enrollmentRow?.payment_deadline
      ? `&deadline=${encodeURIComponent(enrollmentRow.payment_deadline)}`
      : '';
    return { redirectTo: `/enroll/success?pay_later=true${deadlineParam}${conflictParam}` };
  }

  // 5. If Stripe is disabled, activate directly (testing mode)
  if (!stripeEnabled) {
    await adminSupabase
      .from('enrollments')
      .update({ status: 'active' })
      .eq('id', enrollmentId);

    await inviteToClassroom(slot1ClassId);
    if (effectiveSlot2) await inviteToClassroom(effectiveSlot2);
    return { redirectTo: `/enroll/success?test_mode=true${conflictParam}` };
  }

  // 6. Create Stripe Checkout Session
  const price = getPriceForEnrollment(groupSizeType);
  const className = cls.name || 'Digital SAT Class';

  let session;
  try {
    session = await createCheckoutSession({
      enrollmentId: enrollmentId!,
      studentId,
      classId: slot1ClassId,
      groupSizeType,
      className,
      amountInCents: price,
      customerEmail: authUser.email || undefined,
    });
  } catch (err) {
    const { error: cleanupErr } = await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    if (cleanupErr) console.error('Failed to cleanup pending enrollment:', cleanupErr.message);
    console.error('Stripe checkout creation failed:', err);
    return { error: 'Payment system error. Please try again.' };
  }

  if (!session.url) {
    await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    return { error: 'Payment system error. Please try again.' };
  }

  // 7. Store stripe_session_id BEFORE redirecting
  const { error: updateError } = await adminSupabase
    .from('enrollments')
    .update({ stripe_session_id: session.id })
    .eq('id', enrollmentId);

  if (updateError) {
    console.error('Failed to store stripe_session_id:', updateError.message);
    await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    return { error: 'System error. Please try again.' };
  }

  // 8. Redirect to Stripe
  return { redirectTo: session.url };
}
