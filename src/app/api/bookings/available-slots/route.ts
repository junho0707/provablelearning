import { NextRequest, NextResponse } from 'next/server';
import { getFreeBusy } from '@/lib/google/calendar';
import { createClient } from '@/lib/supabase/server';

// Generate 30-min slots between 9am-2pm ET for the admin-configured booking window,
// then subtract busy times from Google Calendar
export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get('date');

  // Fetch the booking window from DB
  const supabase = await createClient();
  const { data: bw } = await supabase
    .from('booking_window')
    .select('window_start, window_end')
    .eq('id', true)
    .single();

  // If no window or dates are null, no slots available
  if (!bw?.window_start || !bw?.window_end) {
    return NextResponse.json({ slots: [], windowStart: null, windowEnd: null });
  }

  const windowStart = new Date(bw.window_start + 'T00:00:00');
  const windowEnd = new Date(bw.window_end + 'T23:59:59');

  // For single-date queries, clamp to window
  let startDate: Date;
  let endDate: Date;

  if (dateParam) {
    const requested = new Date(dateParam);
    requested.setHours(0, 0, 0, 0);
    if (requested < windowStart || requested > windowEnd) {
      return NextResponse.json({ slots: [], windowStart: bw.window_start, windowEnd: bw.window_end });
    }
    startDate = requested;
    endDate = new Date(requested);
    endDate.setDate(endDate.getDate() + 1);
  } else {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    startDate = now > windowStart ? now : windowStart;
    endDate = new Date(windowEnd);
    endDate.setDate(endDate.getDate() + 1); // inclusive end
  }

  // If window is entirely in the past, return empty
  if (startDate > windowEnd) {
    return NextResponse.json({ slots: [], windowStart: bw.window_start, windowEnd: bw.window_end });
  }

  try {
    const busySlots = await getFreeBusy(
      startDate.toISOString(),
      endDate.toISOString()
    );

    // Generate available 30-min slots (9am-2pm ET, weekdays only)
    const slots: string[] = [];
    const current = new Date(startDate);

    // At least 2 hours from now for booking
    const minBookTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

    while (current < endDate && current <= windowEnd) {
      const dayOfWeek = current.getDay();
      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        for (let hour = 9; hour < 14; hour++) {
          for (const minute of [0, 30]) {
            const slotStart = new Date(current);
            slotStart.setHours(hour, minute, 0, 0);
            const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

            // Skip past slots
            if (slotStart < minBookTime) continue;

            // Check if slot overlaps any busy period
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
      }
      current.setDate(current.getDate() + 1);
    }

    return NextResponse.json({
      slots,
      windowStart: bw.window_start,
      windowEnd: bw.window_end,
    });
  } catch (error: unknown) {
    const err = error as Error & { response?: { data?: unknown }; code?: string };
    console.error('Failed to fetch available slots:', err.message, err.code, err.response?.data);
    return NextResponse.json(
      { error: 'Unable to fetch availability. Please try again later.', debug: err.message },
      { status: 500 }
    );
  }
}
