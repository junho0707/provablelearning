import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getFreeBusy } from '@/lib/google/calendar';

export async function GET(request: NextRequest) {
  const cancellationId = request.nextUrl.searchParams.get('cancellation_id');
  if (!cancellationId) {
    return NextResponse.json({ error: 'Missing cancellation_id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Fetch cancellation and verify ownership + eligibility
  const { data: cancellation, error } = await supabase
    .from('session_cancellations')
    .select('id, student_id, group_size_type, status')
    .eq('id', cancellationId)
    .single();

  if (error || !cancellation) {
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

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 14);

    const busySlots = await getFreeBusy(
      startDate.toISOString(),
      endDate.toISOString()
    );

    // Generate 1-hour slots (9am-5pm ET, weekdays only)
    const slots: string[] = [];
    const current = new Date(startDate);
    // At least 2 hours from now
    const minBookTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    while (current < endDate) {
      const dayOfWeek = current.getDay();
      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // 9am-4pm start times (last slot at 4pm ends at 5pm)
        for (let hour = 9; hour < 17; hour++) {
          const slotStart = new Date(current);
          slotStart.setHours(hour, 0, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); // 1 hour

          if (slotStart < minBookTime) continue;

          const isBusy = busySlots.some((busy) => {
            const busyStart = new Date(busy.start!);
            const busyEnd = new Date(busy.end!);
            return slotStart < busyEnd && slotEnd > busyStart;
          });

          if (!isBusy) {
            slots.push(slotStart.toISOString());
          }
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return NextResponse.json({ slots });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Failed to fetch reschedule slots:', error.message);
    return NextResponse.json(
      { error: 'Unable to fetch availability. Please try again later.' },
      { status: 500 }
    );
  }
}
