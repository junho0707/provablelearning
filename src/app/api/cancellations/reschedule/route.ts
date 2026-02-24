import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFreeBusy, createBookingEvent } from '@/lib/google/calendar';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { cancellationId, dateTime } = body as {
    cancellationId: string;
    dateTime: string;
  };

  if (!cancellationId || !dateTime) {
    return NextResponse.json(
      { error: 'Missing cancellationId or dateTime' },
      { status: 400 }
    );
  }

  // Verify cancellation ownership and eligibility
  const { data: cancellation, error: fetchError } = await supabase
    .from('session_cancellations')
    .select('id, student_id, group_size_type, status, course_id, session_number')
    .eq('id', cancellationId)
    .single();

  if (fetchError || !cancellation) {
    return NextResponse.json({ error: 'Cancellation not found' }, { status: 404 });
  }

  if (cancellation.status !== 'cancelled') {
    return NextResponse.json(
      { error: 'This cancellation has already been rescheduled or expired' },
      { status: 400 }
    );
  }

  if (cancellation.group_size_type !== 'one_on_one') {
    return NextResponse.json(
      { error: 'Only 1:1 sessions can be rescheduled' },
      { status: 400 }
    );
  }

  // Re-check free/busy to prevent double-booking
  const slotStart = new Date(dateTime);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

  try {
    const busySlots = await getFreeBusy(
      slotStart.toISOString(),
      slotEnd.toISOString()
    );

    const isStillFree = !busySlots.some((busy) => {
      const busyStart = new Date(busy.start!);
      const busyEnd = new Date(busy.end!);
      return slotStart < busyEnd && slotEnd > busyStart;
    });

    if (!isStillFree) {
      return NextResponse.json(
        { error: 'This time slot is no longer available. Please choose another.' },
        { status: 409 }
      );
    }

    // Get student info for calendar event
    const adminClient = createAdminClient();
    const { data: studentUser } = await adminClient
      .from('students')
      .select('users!students_user_id_fkey(full_name, email)')
      .eq('id', cancellation.student_id)
      .single();

    const userObj = (studentUser as Record<string, unknown>)?.users as unknown as
      | Record<string, string>
      | Record<string, string>[];
    const studentName = Array.isArray(userObj)
      ? userObj[0]?.full_name
      : userObj?.full_name;
    const studentEmail = Array.isArray(userObj)
      ? userObj[0]?.email
      : userObj?.email;

    // Create Google Calendar event
    const event = await createBookingEvent({
      parentName: studentName || 'Student',
      parentEmail: studentEmail || user.email || '',
      dateTime: slotStart.toISOString(),
      durationMin: 60,
    });

    // Update cancellation status
    const { error: updateError } = await adminClient
      .from('session_cancellations')
      .update({
        status: 'rescheduled',
        rescheduled_to: slotStart.toISOString(),
        rescheduled_calendar_event_id: event.id || null,
      })
      .eq('id', cancellationId);

    if (updateError) {
      console.error('Failed to update cancellation:', updateError);
      return NextResponse.json(
        { error: 'Booking created but failed to update cancellation record' },
        { status: 500 }
      );
    }

    // Log to admin_logs
    await adminClient.from('admin_logs').insert({
      admin_id: user.id,
      action: 'session_rescheduled',
      metadata_json: {
        cancellation_id: cancellationId,
        student_id: cancellation.student_id,
        rescheduled_to: slotStart.toISOString(),
        calendar_event_id: event.id,
      },
    });

    // Insert notification for parent or independent student
    try {
      const { data: studentRow } = await adminClient
        .from('students')
        .select('parent_id, user_id')
        .eq('id', cancellation.student_id)
        .single();

      if (studentRow) {
        const parentId = (studentRow as Record<string, unknown>).parent_id as string | null;
        const userId = (studentRow as Record<string, unknown>).user_id as string | null;
        const notifyUserId = parentId || userId;
        const dateStr = slotStart.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        const timeStr = slotStart.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });

        if (notifyUserId) {
          await adminClient.from('notifications').insert({
            user_id: notifyUserId,
            message: `${studentName || 'Your'} session rescheduled to ${dateStr} at ${timeStr}`,
            type: 'makeup',
          });
        }
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      success: true,
      rescheduledTo: slotStart.toISOString(),
      calendarEventId: event.id,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Reschedule failed:', error.message);
    return NextResponse.json(
      { error: 'Failed to reschedule. Please try again later.' },
      { status: 500 }
    );
  }
}
