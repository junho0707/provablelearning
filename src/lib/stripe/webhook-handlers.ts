import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchWaitlistAutoEnroll } from '@/lib/waitlist/auto-enroll';
import { inviteStudentToClassroom } from '@/lib/google/classroom';

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const enrollmentId = session.metadata?.enrollment_id;

  if (!enrollmentId) {
    console.error('No enrollment_id in session metadata');
    return;
  }

  // ACH / bank transfers: checkout.session.completed fires with payment_status 'unpaid'.
  // Don't activate yet — wait for checkout.session.async_payment_succeeded.
  if (session.payment_status === 'unpaid') {
    console.log('ACH payment pending for enrollment', enrollmentId);
    return;
  }

  // Activate enrollment — match on enrollment_id + stripe_session_id
  // Supports both pay-now (pending→active) and deferred payment (active+unpaid→active+paid)
  const { data: updated, error } = await supabase
    .from('enrollments')
    .update({ status: 'active', payment_status: 'paid', payment_deadline: null })
    .eq('id', enrollmentId)
    .eq('stripe_session_id', session.id)
    .in('status', ['pending', 'active'])
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Failed to activate enrollment:', error.message);
    return;
  } else if (!updated) {
    console.warn('Webhook: enrollment already activated or session mismatch', enrollmentId);
    return;
  }

  // --- Post-enrollment Google integrations (best-effort) ---
  try {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('student_id, class_id, slot_1_class_id, slot_2_class_id, student_start_date')
      .eq('id', enrollmentId)
      .single();

    if (enrollment) {
      const slot1Id = enrollment.slot_1_class_id || enrollment.class_id;
      const slot2Id = enrollment.slot_2_class_id;

      // Get class info and student/parent info
      const [{ data: slot1Class }, { data: student }] = await Promise.all([
        supabase.from('classes').select('name, subject, level, meeting_day, meeting_time, meeting_day_2, meeting_time_2, group_size_type, google_classroom_id, google_classroom_enrollment_code, class_start_date').eq('id', slot1Id).single(),
        supabase.from('students').select('user_id, parent_id, email').eq('id', enrollment.student_id).single(),
      ]);

      const studentEmail = student?.email || (student?.user_id
        ? (await supabase.auth.admin.getUserById(student.user_id)).data?.user?.email
        : null);

      // LG calendar blocks are already created when admin creates the class — no per-student invite needed

      // 2) Google Classroom invite for slot 2 (if dual-slot SG)
      if (slot2Id && studentEmail) {
        const { data: slot2Class } = await supabase
          .from('classes')
          .select('google_classroom_id, google_classroom_enrollment_code')
          .eq('id', slot2Id)
          .single();

        if (slot2Class?.google_classroom_id) {
          const result = await inviteStudentToClassroom({
            classroomId: slot2Class.google_classroom_id,
            studentEmail,
            enrollmentCode: slot2Class.google_classroom_enrollment_code,
          });
          if (result.success && !result.selfJoinRequired) {
            // classroom_joined tracks slot 1 primarily
          }
        }
      }

      // 3) Google Classroom invite for slot 1
      if (studentEmail && slot1Class?.google_classroom_id) {
        const classroomResult = await inviteStudentToClassroom({
          classroomId: slot1Class.google_classroom_id,
          studentEmail,
          enrollmentCode: slot1Class.google_classroom_enrollment_code,
        });
        if (classroomResult.success && !classroomResult.selfJoinRequired) {
          await supabase.from('enrollments').update({ classroom_joined: true }).eq('id', enrollmentId);
        }
        if (!classroomResult.success) {
          console.error('Classroom invite failed:', classroomResult.error);
        }
      }
    }
  } catch (err) {
    console.error('Post-enrollment Google integrations error:', err);
  }
}

export async function handleAsyncPaymentSucceeded(session: Stripe.Checkout.Session) {
  // ACH bank transfer cleared — activate the enrollment.
  // Re-use handleCheckoutCompleted by passing a session with payment_status 'paid'.
  await handleCheckoutCompleted({ ...session, payment_status: 'paid' } as Stripe.Checkout.Session);
}

export async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  // ACH bank transfer failed — treat like an expired checkout (free the seat + reverse credits).
  await handleCheckoutExpired(session);

  // Also log for admin visibility
  const supabase = createAdminClient();
  const enrollmentId = session.metadata?.enrollment_id;
  if (enrollmentId) {
    await supabase.from('admin_logs').insert({
      admin_id: '00000000-0000-0000-0000-000000000000',
      action: 'ach_payment_failed',
      metadata_json: {
        enrollment_id: enrollmentId,
        stripe_session_id: session.id,
        student_id: session.metadata?.student_id,
        class_id: session.metadata?.class_id,
      },
    });
  }
}

export async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const enrollmentId = session.metadata?.enrollment_id;

  if (!enrollmentId) return;

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id, student_id, status, payment_status, credits_applied, credits_group_size_type')
    .eq('id', enrollmentId)
    .single();

  if (!enrollment) return;

  // Deferred payment expired: active + unpaid enrollment stays, just clear stripe_session_id
  if (enrollment.status === 'active' && enrollment.payment_status === 'unpaid') {
    await supabase
      .from('enrollments')
      .update({ stripe_session_id: null })
      .eq('id', enrollmentId);
    return;
  }

  if (enrollment.status !== 'pending') return;

  // Reverse credits if any were applied
  if (enrollment.credits_applied > 0 && enrollment.credits_group_size_type) {
    const { error: reverseError } = await supabase.rpc('reverse_credits', {
      p_student_id: enrollment.student_id,
      p_group_size_type: enrollment.credits_group_size_type,
      p_reason: 'Stripe checkout expired — credits reversed',
    });

    if (reverseError) {
      console.error('Failed to reverse credits:', reverseError.message);
    }
  }

  // Delete pending enrollment to free the seat
  const { data: deletedEnrollment } = await supabase
    .from('enrollments')
    .select('class_id, slot_1_class_id, slot_2_class_id')
    .eq('id', enrollmentId)
    .eq('status', 'pending')
    .single();

  await supabase
    .from('enrollments')
    .delete()
    .eq('id', enrollmentId)
    .eq('status', 'pending');

  // Notify next waitlisted student for both slots
  if (deletedEnrollment) {
    const classIds = [
      deletedEnrollment.slot_1_class_id || deletedEnrollment.class_id,
      deletedEnrollment.slot_2_class_id,
    ].filter(Boolean) as string[];

    for (const cId of classIds) {
      await dispatchWaitlistAutoEnroll(cId);
    }
  }
}

export async function handlePaymentFailed(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const enrollmentId = session.metadata?.enrollment_id;

  if (!enrollmentId) return;

  await supabase.from('admin_logs').insert({
    admin_id: '00000000-0000-0000-0000-000000000000',
    action: 'payment_failed',
    metadata_json: {
      enrollment_id: enrollmentId,
      stripe_session_id: session.id,
      student_id: session.metadata?.student_id,
      class_id: session.metadata?.class_id,
    },
  });
}

export async function reconcileStripePayments() {
  const supabase = createAdminClient();
  const { stripe } = await import('./client');

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id, stripe_session_id, status')
    .not('stripe_session_id', 'is', null)
    .eq('status', 'active');

  if (!enrollments) return { checked: 0, mismatches: 0 };

  let mismatches = 0;

  for (const enrollment of enrollments) {
    try {
      const session = await stripe.checkout.sessions.retrieve(enrollment.stripe_session_id!);
      if (session.payment_status !== 'paid') {
        mismatches++;
        await supabase.from('admin_logs').insert({
          admin_id: '00000000-0000-0000-0000-000000000000',
          action: 'reconciliation_mismatch',
          metadata_json: {
            enrollment_id: enrollment.id,
            stripe_session_id: enrollment.stripe_session_id,
            stripe_status: session.payment_status,
            db_status: enrollment.status,
          },
        });
      }
    } catch {
      mismatches++;
    }
  }

  // Check stale pending enrollments
  const { data: pendingWithStripe } = await supabase
    .from('enrollments')
    .select('id, stripe_session_id, student_id, class_id, slot_1_class_id, slot_2_class_id, credits_applied, credits_group_size_type')
    .eq('status', 'pending')
    .not('stripe_session_id', 'is', null)
    .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

  if (pendingWithStripe && pendingWithStripe.length > 0) {
    for (const pending of pendingWithStripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(pending.stripe_session_id!);

        if (session.status === 'expired') {
          if (pending.credits_applied > 0 && pending.credits_group_size_type) {
            await supabase.rpc('reverse_credits', {
              p_student_id: pending.student_id,
              p_group_size_type: pending.credits_group_size_type,
              p_reason: 'Reconciliation: Stripe session expired — credits reversed',
            });
          }

          await supabase
            .from('enrollments')
            .delete()
            .eq('id', pending.id)
            .eq('status', 'pending');

          const classIds = [
            pending.slot_1_class_id || pending.class_id,
            pending.slot_2_class_id,
          ].filter(Boolean) as string[];

          for (const cId of classIds) {
            await dispatchWaitlistAutoEnroll(cId);
          }

          mismatches++;
        } else if (session.payment_status === 'paid') {
          await supabase
            .from('enrollments')
            .update({ status: 'active', payment_status: 'paid', payment_deadline: null })
            .eq('id', pending.id)
            .in('status', ['pending', 'active']);

          // Invite to Google Classroom (best-effort)
          const slot1Id = pending.slot_1_class_id || pending.class_id;
          if (slot1Id && pending.student_id) {
            try {
              const [{ data: cls }, { data: student }] = await Promise.all([
                supabase.from('classes').select('google_classroom_id, google_classroom_enrollment_code').eq('id', slot1Id).single(),
                supabase.from('students').select('user_id, email').eq('id', pending.student_id).single(),
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
                    await supabase.from('enrollments').update({ classroom_joined: true }).eq('id', pending.id);
                  }
                }
              }
            } catch {
              // Non-critical
            }
          }

          mismatches++;
        }
      } catch {
        mismatches++;
      }
    }
  }

  // Orphaned pending enrollments
  const { data: orphaned } = await supabase
    .from('enrollments')
    .select('id, created_at')
    .eq('status', 'pending')
    .is('stripe_session_id', null)
    .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

  if (orphaned && orphaned.length > 0) {
    for (const orphan of orphaned) {
      await supabase.from('admin_logs').insert({
        admin_id: '00000000-0000-0000-0000-000000000000',
        action: 'reconciliation_orphaned_pending',
        metadata_json: {
          enrollment_id: orphan.id,
          created_at: orphan.created_at,
        },
      });
    }
    mismatches += orphaned.length;
  }

  return { checked: enrollments.length, mismatches };
}
