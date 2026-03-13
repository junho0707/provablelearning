'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reserveSeat } from '@/lib/enrollment/reserve';
import { getPriceForEnrollment } from '@/lib/constants';
import { createCheckoutSession } from '@/lib/stripe/create-checkout';
import { redirect } from 'next/navigation';

const stripeEnabled = process.env.STRIPE_ENABLED === 'true';

export async function acceptOfferAction(formData: FormData) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const waitlistId = formData.get('waitlist_id') as string;
  const slot1ClassId = formData.get('slot_1_class_id') as string;
  const slot2ClassId = formData.get('slot_2_class_id') as string;
  const studentStartDate = formData.get('student_start_date') as string | null;
  const paymentChoice = formData.get('payment_choice') as string | null;
  const payLater = paymentChoice === 'pay_later';
  const subjectCategory = formData.get('subject_category') as string | null;
  const subjectDetail = formData.get('subject_detail') as string | null;

  if (!waitlistId || !slot1ClassId || !slot2ClassId) {
    return { error: 'Missing required fields.' };
  }

  // 1. Fetch waitlist entry and verify status + ownership
  const { data: entry } = await adminSupabase
    .from('waitlist')
    .select('id, student_id, status, offer_expires_at, preferred_class_ids, agreement_version, agreement_timestamp')
    .eq('id', waitlistId)
    .single();

  if (!entry) {
    return { error: 'Waitlist entry not found.' };
  }

  if (entry.status !== 'notified') {
    return { error: 'This offer is no longer available.' };
  }

  if (entry.offer_expires_at && new Date(entry.offer_expires_at) < new Date()) {
    return { error: 'This offer has expired.' };
  }

  // Verify ownership: user must own the student
  const { data: student } = await adminSupabase
    .from('students')
    .select('user_id, parent_id')
    .eq('id', entry.student_id)
    .single();

  if (!student || (student.parent_id !== user.id && student.user_id !== user.id)) {
    return { error: 'Unauthorized.' };
  }

  // Verify chosen slots are in preferred_class_ids
  const prefs = (entry.preferred_class_ids as string[]) || [];
  if (!prefs.includes(slot1ClassId) || !prefs.includes(slot2ClassId)) {
    return { error: 'Selected slots are not in your preferred list.' };
  }

  // 2. Get class info for Stripe
  const { data: cls } = await adminSupabase
    .from('classes')
    .select('name, group_size_type')
    .eq('id', slot1ClassId)
    .single();

  if (!cls) {
    return { error: 'Class not found.' };
  }

  const groupSizeType = cls.group_size_type;

  // 3. Reserve seat
  const { enrollmentId, error: reserveError } = await reserveSeat(
    adminSupabase,
    entry.student_id,
    slot1ClassId,
    slot2ClassId,
    entry.agreement_version,
    entry.agreement_timestamp,
    payLater,
    studentStartDate || undefined,
    null, // slot3ClassId
    subjectCategory,
    subjectDetail,
    2 // slotsPerWeek
  );

  if (reserveError || !enrollmentId) {
    // Reservation failed (slots may have filled in the meantime)
    // Set entry back to waiting so they get re-notified if slots open again
    await adminSupabase
      .from('waitlist')
      .update({ status: 'waiting', notified_at: null, offer_expires_at: null })
      .eq('id', entry.id);

    return { error: reserveError || 'Failed to reserve seat. The spot may have been taken. You have been placed back on the waitlist.' };
  }

  // 4. Mark waitlist entry as converted
  await adminSupabase
    .from('waitlist')
    .update({ status: 'converted' })
    .eq('id', entry.id);

  // 4b. Resolve makeup booking conflicts
  let conflictParam = '';
  if (groupSizeType === 'small' || groupSizeType === 'one_on_one') {
    try {
      const { data: conflicts } = await adminSupabase.rpc('resolve_enrollment_makeup_conflicts', {
        p_enrollment_id: enrollmentId,
        p_cancelled_by: user.id,
      });
      if (conflicts && Array.isArray(conflicts) && conflicts.length > 0) {
        const dates = conflicts.map((c: { conflict_session_date: string }) => c.conflict_session_date);
        conflictParam = `&conflicts=${encodeURIComponent(dates.join(','))}`;

        // Notify
        const { data: studentRow } = await adminSupabase
          .from('students')
          .select('parent_id, user_id')
          .eq('id', entry.student_id)
          .single();
        const notifyUserId = studentRow?.parent_id || studentRow?.user_id;
        if (notifyUserId) {
          const dateList = dates.map((d: string) => {
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

  // 5. If Stripe is disabled, activate directly (testing mode)
  if (!stripeEnabled) {
    await adminSupabase
      .from('enrollments')
      .update({ status: 'active' })
      .eq('id', enrollmentId);

    return { redirectTo: `/enroll/success?test_mode=true${conflictParam}` };
  }

  // 5b. Pay later — already active+unpaid from reserveSeat, skip Stripe
  if (payLater) {
    return { redirectTo: `/enroll/success?pay_later=true${conflictParam}` };
  }

  // 6. Create Stripe Checkout
  const price = getPriceForEnrollment(groupSizeType);
  const className = cls.name || 'Digital SAT Class';

  let session;
  try {
    session = await createCheckoutSession({
      enrollmentId,
      studentId: entry.student_id,
      classId: slot1ClassId,
      groupSizeType,
      className,
      amountInCents: price,
      customerEmail: user.email || undefined,
    });
  } catch (err) {
    // Cleanup: delete pending enrollment
    await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    // Revert waitlist entry
    await adminSupabase
      .from('waitlist')
      .update({ status: 'waiting', notified_at: null, offer_expires_at: null })
      .eq('id', entry.id);
    console.error('Stripe checkout creation failed:', err);
    return { error: 'Payment system error. Please try again.' };
  }

  if (!session.url) {
    await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    await adminSupabase
      .from('waitlist')
      .update({ status: 'waiting', notified_at: null, offer_expires_at: null })
      .eq('id', entry.id);
    return { error: 'Payment system error. Please try again.' };
  }

  // 7. Store stripe_session_id
  const { error: updateError } = await adminSupabase
    .from('enrollments')
    .update({ stripe_session_id: session.id })
    .eq('id', enrollmentId);

  if (updateError) {
    console.error('Failed to store stripe_session_id:', updateError.message);
    await adminSupabase.from('enrollments').delete().eq('id', enrollmentId).eq('status', 'pending');
    await adminSupabase
      .from('waitlist')
      .update({ status: 'waiting', notified_at: null, offer_expires_at: null })
      .eq('id', entry.id);
    return { error: 'System error. Please try again.' };
  }

  return { redirectTo: session.url };
}
