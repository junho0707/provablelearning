import { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/notifications/send-email';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Send an email to the parent (or independent student) notifying them
 * that a spot has opened up on the waitlist.
 */
export async function sendWaitlistOfferEmail(
  supabase: SupabaseClient,
  waitlistId: string,
  studentId: string
): Promise<void> {
  // Get student + parent info
  const { data: student } = await supabase
    .from('students')
    .select('user_id, parent_id, email')
    .eq('id', studentId)
    .single();

  if (!student) return;

  // Determine recipient: parent if linked, otherwise the student's own user
  const recipientUserId = student.parent_id || student.user_id;
  if (!recipientUserId) return;

  const { data: recipientAuth } = await supabase.auth.admin.getUserById(recipientUserId);
  const recipientEmail = recipientAuth?.user?.email;
  if (!recipientEmail) return;

  const recipientName = recipientAuth?.user?.user_metadata?.full_name || 'there';

  // Get student name
  let studentName = 'your student';
  if (student.user_id) {
    const { data: studentAuth } = await supabase.auth.admin.getUserById(student.user_id);
    studentName = studentAuth?.user?.user_metadata?.full_name || 'your student';
  }

  const offerUrl = `${BASE_URL}/enroll/waitlist-offer/${waitlistId}`;

  await sendEmail({
    to: recipientEmail,
    subject: 'A spot has opened up! Accept within 3 days',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>A spot is available!</h2>
        <p>Hi ${recipientName},</p>
        <p>A spot has opened up for <strong>${studentName}</strong>. You have <strong>3 days</strong> to accept this offer and complete payment.</p>
        <p>After 3 days the offer will expire and the spot will go to the next person on the waitlist.</p>
        <div style="margin: 24px 0;">
          <a href="${offerUrl}" style="background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Accept Offer
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">If you no longer need this spot, no action is required — it will automatically expire.</p>
      </div>
    `,
  });
}
