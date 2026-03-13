import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBookingNotification } from '@/lib/notifications/send-booking-notification';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find bookings 11–12 hours from now that haven't been reminded
  const now = new Date();
  const fiveHours = new Date(now.getTime() + 11 * 60 * 60 * 1000);
  const sixHours = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  const { data: bookings, error: fetchError } = await supabase
    .from('bookings')
    .select('id, parent_name, parent_email, parent_phone, datetime, contact_method, meeting_type, meet_link')
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)
    .gte('datetime', fiveHours.toISOString())
    .lte('datetime', sixHours.toISOString());

  if (fetchError) {
    console.error('Failed to fetch bookings for reminders:', fetchError.message);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const booking of bookings ?? []) {
    try {
      await sendBookingNotification({
        contactMethod: booking.contact_method as 'email' | 'sms' | 'both',
        email: booking.parent_email,
        phone: booking.parent_phone,
        parentName: booking.parent_name,
        dateTime: booking.datetime,
        meetingType: booking.meeting_type as 'meet' | 'phone',
        meetLink: booking.meet_link,
        type: 'reminder',
      });

      const { error: updateError } = await supabase
        .from('bookings')
        .update({ reminder_sent: true })
        .eq('id', booking.id);

      if (updateError) {
        errors.push(`Failed to mark reminder sent for ${booking.id}: ${updateError.message}`);
      } else {
        sent++;
      }
    } catch (err) {
      errors.push(`Failed to send reminder for ${booking.id}: ${err}`);
    }
  }

  return NextResponse.json({
    total: bookings?.length ?? 0,
    sent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
