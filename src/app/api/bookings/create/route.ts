import { NextRequest, NextResponse } from 'next/server';
import { createBookingEvent } from '@/lib/google/calendar';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const BookingSchema = z.object({
  parentName: z.string().min(1).max(200),
  parentEmail: z.string().email(),
  parentPhone: z.string().min(7).max(20),
  dateTime: z.string().datetime(),
  studentName: z.string().max(200).optional(),
  className: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = BookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid booking data', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { parentName, parentEmail, parentPhone, dateTime, studentName, className } = parsed.data;

  // Validate the slot is in the future (at least 1 hour)
  const bookingTime = new Date(dateTime);
  if (bookingTime.getTime() < Date.now() + 60 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Booking must be at least 1 hour in the future.' },
      { status: 400 }
    );
  }

  try {
    // Create Google Calendar event
    const event = await createBookingEvent({
      parentName,
      parentEmail,
      dateTime,
      durationMin: 30,
      context: studentName ? { studentName, className } : undefined,
    });

    // Store in DB
    const supabase = createAdminClient();
    const { error: dbError } = await supabase.from('bookings').insert({
      parent_name: parentName,
      parent_email: parentEmail,
      parent_phone: parentPhone,
      datetime: dateTime,
      duration_min: 30,
      google_event_id: event.id || null,
      student_name: studentName || null,
      class_name: className || null,
    });

    if (dbError) {
      console.error('Failed to save booking:', dbError.message);
    }

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
