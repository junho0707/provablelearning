import { google } from 'googleapis';
import { getAuthedClient } from '@/lib/google/auth';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/google/create-booking-calendar
 * Creates a private "Consultations" calendar for booking events.
 * NOT made publicly readable — only the service account + admin can see it.
 * Admin-only endpoint.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const auth = await getAuthedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const res = await calendar.calendars.insert({
      requestBody: {
        summary: 'Consultations',
        description: 'Provable Learning — parent consultation bookings (private)',
        timeZone: 'America/New_York',
      },
    });

    const calendarId = res.data.id;

    return NextResponse.json({
      success: true,
      calendarId,
      message: `Calendar "Consultations" created. Add GOOGLE_BOOKING_CALENDAR_ID=${calendarId} to .env.local and redeploy.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to create booking calendar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
