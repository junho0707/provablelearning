import { NextRequest, NextResponse } from 'next/server';
import { getFreeBusy } from '@/lib/google/calendar';
import { createClient } from '@/lib/supabase/server';

// ET offset helpers — handles EST/EDT automatically
function getETOffset(date: Date): number {
  // US Eastern: UTC-5 (EST) or UTC-4 (EDT)
  // DST: second Sunday in March to first Sunday in November
  const year = date.getUTCFullYear();
  const mar = new Date(Date.UTC(year, 2, 1));
  const nov = new Date(Date.UTC(year, 10, 1));
  // Second Sunday in March
  const dstStart = new Date(Date.UTC(year, 2, 14 - mar.getUTCDay()));
  dstStart.setUTCHours(7); // 2am EST = 7am UTC
  // First Sunday in November
  const dstEnd = new Date(Date.UTC(year, 10, 7 - nov.getUTCDay()));
  dstEnd.setUTCHours(6); // 2am EDT = 6am UTC
  return (date >= dstStart && date < dstEnd) ? -4 : -5;
}

/** Create a UTC Date for a given ET hour on a given date string (YYYY-MM-DD) */
function etToUTC(dateStr: string, hour: number, minute: number): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const offset = getETOffset(d);
  d.setUTCHours(hour - offset, minute, 0, 0);
  return d;
}

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

  // Work with date strings (YYYY-MM-DD) to avoid timezone confusion
  const today = new Date().toISOString().split('T')[0];

  let startDateStr: string;
  let endDateStr: string;

  if (dateParam) {
    if (dateParam < bw.window_start || dateParam > bw.window_end) {
      return NextResponse.json({ slots: [], windowStart: bw.window_start, windowEnd: bw.window_end });
    }
    startDateStr = dateParam;
    endDateStr = dateParam;
  } else {
    startDateStr = today > bw.window_start ? today : bw.window_start;
    endDateStr = bw.window_end;
  }

  // If window is entirely in the past, return empty
  if (startDateStr > bw.window_end) {
    return NextResponse.json({ slots: [], windowStart: bw.window_start, windowEnd: bw.window_end });
  }

  try {
    // FreeBusy query range: 9am ET on start date to 2pm ET on end date
    const fbStart = etToUTC(startDateStr, 9, 0);
    const fbEndDate = new Date(`${endDateStr}T00:00:00Z`);
    fbEndDate.setUTCDate(fbEndDate.getUTCDate() + 1);
    const fbEnd = fbEndDate;

    let busySlots: { start?: string | null; end?: string | null }[] = [];
    try {
      busySlots = await getFreeBusy(fbStart.toISOString(), fbEnd.toISOString());
    } catch (calErr) {
      console.error('[SLOTS] getFreeBusy failed, generating slots without busy check:', calErr);
      // Continue with empty busy list — slots will still show up
    }

    // Generate available 30-min slots (9am-2pm ET, weekdays only)
    const slots: string[] = [];

    // At least 2 hours from now for booking
    const minBookTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // Iterate date strings day by day
    const cursor = new Date(`${startDateStr}T12:00:00Z`); // noon UTC to avoid date drift
    const endCheck = new Date(`${endDateStr}T12:00:00Z`);

    while (cursor <= endCheck) {
      const dayOfWeek = cursor.getUTCDay();
      const dateStr = cursor.toISOString().split('T')[0];

      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        for (let hour = 9; hour < 14; hour++) {
          for (const minute of [0, 30]) {
            const slotStart = etToUTC(dateStr, hour, minute);
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
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return NextResponse.json({
      slots,
      windowStart: bw.window_start,
      windowEnd: bw.window_end,
    });
  } catch (error: unknown) {
    const err = error as Error & { response?: { data?: unknown }; code?: string };
    console.error('Failed to generate slots:', err.message, err.code, err.response?.data);
    return NextResponse.json(
      { error: 'Unable to fetch availability. Please try again later.', debug: err.message,
        windowStart: bw.window_start, windowEnd: bw.window_end },
      { status: 500 }
    );
  }
}
