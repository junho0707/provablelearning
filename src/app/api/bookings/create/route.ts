import { NextRequest, NextResponse } from 'next/server';
import { createBookingEvent } from '@/lib/google/calendar';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sendBookingNotification } from '@/lib/notifications/send-booking-notification';
import { z } from 'zod';

const BookingSchema = z.object({
  parentName: z.string().min(1).max(200),
  parentEmail: z.string().email(),
  parentPhone: z.string().max(20).default(''),
  dateTime: z.string().datetime(),
  contactMethod: z.enum(['email', 'sms', 'both']).default('email'),
  meetingType: z.enum(['meet', 'phone']).default('meet'),
  studentName: z.string().max(200).optional(),
  className: z.string().max(200).optional(),
  bookingType: z.enum(['initial', 'refund']).default('initial'),
});

export async function POST(request: NextRequest) {
  if (process.env.DEMO_MODE === 'true') {
    return NextResponse.json(
      { error: 'Booking is disabled in this portfolio demo.' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = BookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid booking data', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { parentName, parentEmail, parentPhone, dateTime, contactMethod, meetingType, studentName, className, bookingType } = parsed.data;

  // Validate the slot is in the future (at least 1 hour)
  const bookingTime = new Date(dateTime);
  if (bookingTime.getTime() < Date.now() + 60 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Booking must be at least 1 hour in the future.' },
      { status: 400 }
    );
  }

  // Get logged-in user (if any) to link booking to their account
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  // One-time booking: check if email or user already has a confirmed future booking of the same type
  const supabase = createAdminClient();
  const orFilter = user
    ? `parent_email.ilike.${parentEmail},user_id.eq.${user.id}`
    : `parent_email.ilike.${parentEmail}`;
  const { data: existing } = await supabase
    .from('bookings')
    .select('id, datetime')
    .or(orFilter)
    .eq('status', 'confirmed')
    .eq('booking_type', bookingType)
    .gte('datetime', new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'You already have a consultation booked. Check your email for the calendar invite.' },
      { status: 409 }
    );
  }

  try {
    // Create Google Calendar event
    console.log('[BOOKING] Creating calendar event for', parentEmail);
    let event: { id?: string | null; meetLink?: string | null };
    try {
      event = await createBookingEvent({
        parentName,
        parentEmail,
        parentPhone,
        dateTime,
        durationMin: 30,
        meetingType,
        context: studentName ? { studentName, className } : undefined,
      });
      console.log('[BOOKING] Calendar event created:', event.id);
    } catch (calError) {
      console.error('[BOOKING] Google Calendar failed, saving booking without calendar event:', calError);
      // Still save the booking even if Calendar fails
      event = { id: null, meetLink: null };
    }

    // Store in DB
    console.log('[BOOKING] Inserting into DB, user_id:', user?.id || 'anonymous');
    const { data: insertedBooking, error: dbError } = await supabase.from('bookings').insert({
      parent_name: parentName,
      parent_email: parentEmail,
      parent_phone: parentPhone,
      datetime: dateTime,
      duration_min: 30,
      google_event_id: event.id || null,
      student_name: studentName || null,
      class_name: className || null,
      contact_method: contactMethod,
      meeting_type: meetingType,
      meet_link: event.meetLink || null,
      user_id: user?.id || null,
      booking_type: bookingType,
    }).select('id').single();

    if (dbError) {
      console.error('[BOOKING] DB insert FAILED:', dbError.message, dbError.details, dbError.hint);
      return NextResponse.json(
        { error: 'Booking could not be saved. Please try again.' },
        { status: 500 }
      );
    }
    console.log('[BOOKING] Saved to DB:', insertedBooking?.id);

    // Fire-and-forget confirmation notification
    sendBookingNotification({
      contactMethod,
      email: parentEmail,
      phone: parentPhone,
      parentName,
      dateTime,
      meetingType,
      meetLink: event.meetLink,
      type: 'confirmation',
    }).catch((err) => console.error('Confirmation notification failed:', err));

    return NextResponse.json({
      success: true,
      message: 'Booking confirmed! Check your email for a calendar invite.',
    });
  } catch (error) {
    console.error('Booking creation failed:', error);
    return NextResponse.json(
      { error: 'Unable to create booking. Please try again later.' },
      { status: 500 }
    );
  }
}
