import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoEnrollFromWaitlist } from '@/lib/waitlist/auto-enroll';
import { createClassEvent } from '@/lib/google/calendar';
import { inviteStudentToClassroom } from '@/lib/google/classroom';
import { COURSE_DURATION_WEEKS } from '@/lib/constants';

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const enrollmentId = session.metadata?.enrollment_id;

  if (!enrollmentId) {
    console.error('No enrollment_id in session metadata');
    return;
  }

  // Activate enrollment — match on enrollment_id + stripe_session_id + pending status
  // Triple-match prevents replay attacks and ensures idempotency
  const { data: updated, error } = await supabase
    .from('enrollments')
    .update({ status: 'active' })
    .eq('id', enrollmentId)
    .eq('stripe_session_id', session.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Failed to activate enrollment:', error.message);
    return;
  } else if (!updated) {
    console.warn('Webhook: enrollment already activated or session mismatch', enrollmentId);
    return;
  }

  // --- Post-enrollment Google integrations (best-effort, don't fail the webhook) ---
  try {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('student_id, class_id, course_id')
      .eq('id', enrollmentId)
      .single();

    if (enrollment) {
      // Get class, course, student, and parent info
      const [{ data: cls }, { data: course }, { data: student }] = await Promise.all([
        supabase.from('classes').select('meeting_day, meeting_time, google_meet_link, google_classroom_id').eq('id', enrollment.class_id).single(),
        supabase.from('courses').select('name, subject, level, start_date').eq('id', enrollment.course_id).single(),
        supabase.from('students').select('user_id, parent_id').eq('id', enrollment.student_id).single(),
      ]);

      // Get parent email for calendar invite
      const parentId = student?.parent_id;
      const parentEmail = parentId
        ? (await supabase.auth.admin.getUserById(parentId)).data?.user?.email
        : null;

      // Get student email for classroom invite
      const studentEmail = student?.user_id
        ? (await supabase.auth.admin.getUserById(student.user_id)).data?.user?.email
        : null;

      // 1) Google Calendar invite to parent
      if (parentEmail && cls && course) {
        await createClassEvent({
          summary: `${course.name} — ${course.subject.replace('_', ' ')} (${course.level})`,
          startDate: course.start_date,
          meetingDay: cls.meeting_day,
          meetingTime: cls.meeting_time,
          weeksCount: COURSE_DURATION_WEEKS,
          attendeeEmail: parentEmail,
          meetLink: cls.google_meet_link,
        }).catch((err) => console.error('Calendar invite failed:', err));
      }

      // 2) Google Classroom invite for student
      if (studentEmail && cls?.google_classroom_id) {
        await inviteStudentToClassroom({
          classroomId: cls.google_classroom_id,
          studentEmail,
        }).catch((err) => console.error('Classroom invite failed:', err));
      }
    }
  } catch (err) {
    // Log but don't fail the webhook
    console.error('Post-enrollment Google integrations error:', err);
  }
}

export async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const enrollmentId = session.metadata?.enrollment_id;

  if (!enrollmentId) return;

  // Check if credits were applied to this enrollment and reverse them
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id, student_id, credits_applied, credits_group_size_type')
    .eq('id', enrollmentId)
    .eq('status', 'pending')
    .single();

  if (!enrollment) {
    // Already deleted or activated — idempotent
    return;
  }

  // Reverse credits if any were applied
  if (enrollment.credits_applied > 0 && enrollment.credits_group_size_type) {
    const { error: reverseError } = await supabase.rpc('reverse_credits', {
      p_student_id: enrollment.student_id,
      p_group_size_type: enrollment.credits_group_size_type,
      p_reason: 'Stripe checkout expired — credits reversed',
    });

    if (reverseError) {
      console.error('Failed to reverse credits:', reverseError.message);
      // Log for manual reconciliation but continue with enrollment cleanup
      await supabase.from('admin_logs').insert({
        admin_id: '00000000-0000-0000-0000-000000000000',
        action: 'credit_reversal_failed',
        metadata_json: {
          enrollment_id: enrollmentId,
          student_id: enrollment.student_id,
          credits_applied: enrollment.credits_applied,
          error: reverseError.message,
        },
      });
    }
  }

  // Delete pending enrollment to free the seat
  const { error } = await supabase
    .from('enrollments')
    .delete()
    .eq('id', enrollmentId)
    .eq('status', 'pending');

  if (error) {
    console.error('Failed to release seat:', error.message);
    return;
  }

  // Notify next waitlisted student for this class
  const classId = session.metadata?.class_id;
  if (classId) {
    await autoEnrollFromWaitlist(classId);
  }
}

export async function handlePaymentFailed(session: Stripe.Checkout.Session) {
  // FIX #23: Handle payment failure — log it for admin visibility
  // The enrollment stays pending; Stripe session will eventually expire
  // and handleCheckoutExpired will clean up
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

  // Find active enrollments with stripe_session_ids
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id, stripe_session_id, status')
    .not('stripe_session_id', 'is', null)
    .eq('status', 'active');

  if (!enrollments) return { checked: 0, mismatches: 0 };

  let mismatches = 0;

  for (const enrollment of enrollments) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        enrollment.stripe_session_id!
      );

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
    } catch (err) {
      mismatches++;
    }
  }

  // Check pending enrollments WITH stripe_session_id where Stripe session may have expired
  // (webhook never arrived — belt-and-suspenders cleanup)
  const { data: pendingWithStripe } = await supabase
    .from('enrollments')
    .select('id, stripe_session_id, student_id, class_id, credits_applied, credits_group_size_type')
    .eq('status', 'pending')
    .not('stripe_session_id', 'is', null)
    .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

  if (pendingWithStripe && pendingWithStripe.length > 0) {
    for (const pending of pendingWithStripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(pending.stripe_session_id!);

        if (session.status === 'expired') {
          // Stripe session expired but webhook never arrived — clean up
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

          if (pending.class_id) {
            await autoEnrollFromWaitlist(pending.class_id);
          }

          mismatches++;
          await supabase.from('admin_logs').insert({
            admin_id: '00000000-0000-0000-0000-000000000000',
            action: 'reconciliation_expired_pending_cleaned',
            metadata_json: {
              enrollment_id: pending.id,
              stripe_session_id: pending.stripe_session_id,
              credits_reversed: pending.credits_applied > 0,
            },
          });
        } else if (session.payment_status === 'paid') {
          // Payment succeeded but webhook never arrived — activate
          await supabase
            .from('enrollments')
            .update({ status: 'active' })
            .eq('id', pending.id)
            .eq('status', 'pending');

          mismatches++;
          await supabase.from('admin_logs').insert({
            admin_id: '00000000-0000-0000-0000-000000000000',
            action: 'reconciliation_paid_pending_activated',
            metadata_json: {
              enrollment_id: pending.id,
              stripe_session_id: pending.stripe_session_id,
            },
          });
        }
      } catch {
        mismatches++;
      }
    }
  }

  // Also check for pending enrollments without stripe_session_id (orphaned)
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
