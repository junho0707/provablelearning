import { NextRequest, NextResponse } from 'next/server';
import { getFreeBusy } from '@/lib/google/calendar';

// Generate 30-min slots between 9am-5pm ET for the next 14 days,
// then subtract busy times from Google Calendar
export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get('date');

  // Default: next 14 days
  const startDate = dateParam
    ? new Date(dateParam)
    : new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (dateParam ? 1 : 14));

  try {
    const busySlots = await getFreeBusy(
      startDate.toISOString(),
      endDate.toISOString()
    );

    // Generate available 30-min slots (9am-5pm ET, weekdays only)
    const slots: string[] = [];
    const current = new Date(startDate);

    // Don't show slots in the past
    const now = new Date();
    // At least 2 hours from now for booking
    const minBookTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    while (current < endDate) {
      const dayOfWeek = current.getDay();
      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        for (let hour = 9; hour < 17; hour++) {
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

    return NextResponse.json({ slots });
  } catch (error: unknown) {
    const err = error as Error & { response?: { data?: unknown }; code?: string };
    console.error('Failed to fetch available slots:', err.message, err.code, err.response?.data);
    return NextResponse.json(
      { error: 'Unable to fetch availability. Please try again later.', debug: err.message },
      { status: 500 }
    );
  }
}
